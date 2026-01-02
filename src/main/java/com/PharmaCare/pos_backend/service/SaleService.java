package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.SaleRequest;
import com.PharmaCare.pos_backend.dto.request.StockDeductionRequest;
import com.PharmaCare.pos_backend.dto.response.DashboardSummary;
import com.PharmaCare.pos_backend.dto.response.SalesSummary;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.SaleResponse;
import com.PharmaCare.pos_backend.enums.PaymentMethod;
import com.PharmaCare.pos_backend.enums.UnitType;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.model.Sale;
import com.PharmaCare.pos_backend.model.SaleItem;
import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.SaleRepository;
import com.PharmaCare.pos_backend.repository.SaleItemRepository;
import com.PharmaCare.pos_backend.repository.UserRepository;
import com.PharmaCare.pos_backend.repository.MedicineRepository;
import com.PharmaCare.pos_backend.util.StockCalculator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SaleService {

    private final SaleRepository saleRepository;
    private final SaleItemRepository saleItemRepository;
    private final UserRepository userRepository;
    private final MedicineRepository medicineRepository;
    private final StockService stockService;

    public SaleResponse getSaleById(UUID id) {
        Sale sale = saleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Sale", "id", id));
        return mapToSaleResponse(sale);
    }

    public PaginatedResponse<SaleResponse> getAllSales(int page, int limit, LocalDate startDate,
                                                       LocalDate endDate, UUID cashierId, PaymentMethod paymentMethod) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());

        LocalDateTime startDateTime = startDate != null ? startDate.atStartOfDay() : null;
        LocalDateTime endDateTime = endDate != null ? endDate.atTime(LocalTime.MAX) : null;

        Page<Sale> salesPage = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, cashierId, paymentMethod, pageable);

        List<SaleResponse> saleResponses = salesPage.getContent()
                .stream()
                .map(this::mapToSaleResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(saleResponses, page, limit, salesPage.getTotalElements());
    }

    /**
     * FIXED: Create sale with CORRECT stock deduction
     */
    @Transactional
    public SaleResponse createSale(SaleRequest request) {
        log.info("=== STARTING SALE CREATION ===");
        log.info("Sale request: {} items, Total: KSh {}",
                request.getItems().size(), request.getTotal());

        // Validate cashier
        User cashier = userRepository.findById(request.getCashierId())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getCashierId()));

        log.info("Cashier: {} (ID: {})", cashier.getName(), cashier.getId());

        // Create sale
        Sale sale = Sale.builder()
                .subtotal(request.getSubtotal())
                .discount(request.getDiscount() != null ? request.getDiscount() : BigDecimal.ZERO)
                .tax(request.getTax() != null ? request.getTax() : BigDecimal.ZERO)
                .total(request.getTotal())
                .paymentMethod(request.getPaymentMethod())
                .cashier(cashier)
                .cashierName(request.getCashierName())
                .customerName(request.getCustomerName())
                .customerPhone(request.getCustomerPhone())
                .createdAt(LocalDateTime.now())
                .build();

        Sale savedSale = saleRepository.save(sale);
        log.info("Sale created with ID: {}", savedSale.getId());

        // Process items
        List<SaleItem> saleItems = new ArrayList<>();
        BigDecimal totalCostOfGoodsSold = BigDecimal.ZERO;

        for (SaleRequest.SaleItemRequest itemRequest : request.getItems()) {
            log.info("Processing item: {} x {} {}",
                    itemRequest.getQuantity(), itemRequest.getUnitType(), itemRequest.getMedicineName());

            Medicine medicine = medicineRepository.findById(itemRequest.getMedicineId())
                    .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", itemRequest.getMedicineId()));

            log.info("Medicine: {}, Current stock: {}", medicine.getName(), medicine.getStockQuantity());

            // Calculate cost
            BigDecimal costPerUnit = StockCalculator.calculateCostPerUnit(medicine);
            int quantityInSmallestUnits = StockCalculator.convertToSmallestUnits(
                    medicine, itemRequest.getQuantity(), itemRequest.getUnitType()
            );

            BigDecimal costOfGoodsSold = costPerUnit.multiply(BigDecimal.valueOf(quantityInSmallestUnits));
            totalCostOfGoodsSold = totalCostOfGoodsSold.add(costOfGoodsSold);

            // Create sale item
            SaleItem saleItem = SaleItem.builder()
                    .sale(savedSale)
                    .medicine(medicine)
                    .medicineName(itemRequest.getMedicineName())
                    .unitType(UnitType.fromString(itemRequest.getUnitType()))
                    .quantity(itemRequest.getQuantity())
                    .unitPrice(itemRequest.getUnitPrice())
                    .totalPrice(itemRequest.getTotalPrice())
                    .costPrice(costPerUnit)
                    .costOfGoodsSold(costOfGoodsSold)
                    .build();

            saleItems.add(saleItem);

            log.info("Created sale item: {} x {} {}, Cost: KSh {}",
                    itemRequest.getQuantity(), itemRequest.getUnitType(),
                    itemRequest.getMedicineName(), costOfGoodsSold);

            // FIXED: Deduct stock ONCE per item
            try {
                log.info("Deducting stock for: {} (Current: {})",
                        medicine.getName(), medicine.getStockQuantity());

                StockDeductionRequest deductionRequest = new StockDeductionRequest(
                        itemRequest.getQuantity(),
                        itemRequest.getUnitType(),
                        savedSale.getId().toString(),
                        cashier.getId().toString(),
                        cashier.getRole().name()
                );

                // Single deduction call
                stockService.deductStock(itemRequest.getMedicineId(), deductionRequest);

                log.info("Stock deducted successfully for {}", medicine.getName());

            } catch (Exception e) {
                log.error("Failed to deduct stock for {}: {}", medicine.getName(), e.getMessage());

                // Rollback sale
                saleRepository.delete(savedSale);
                throw new ApiException("Failed to deduct stock: " + e.getMessage(),
                        HttpStatus.BAD_REQUEST);
            }
        }

        // Save all items
        saleItemRepository.saveAll(saleItems);
        savedSale.setItems(saleItems);
        savedSale.setCostOfGoodsSold(totalCostOfGoodsSold);

        Sale finalSale = saleRepository.save(savedSale);

        log.info("=== SALE COMPLETED ===");
        log.info("Sale ID: {}, Items: {}, Total: KSh {}, Profit: KSh {}",
                finalSale.getId(), finalSale.getItems().size(),
                finalSale.getTotal(), finalSale.getTotal().subtract(totalCostOfGoodsSold));

        return mapToSaleResponse(finalSale);
    }

    public SalesSummary getSalesSummary(LocalDate startDate, LocalDate endDate, String groupBy) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        BigDecimal totalSales = sales.stream()
                .map(Sale::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalCostOfGoodsSold = sales.stream()
                .map(Sale::getCostOfGoodsSold)
                .filter(cogs -> cogs != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (totalCostOfGoodsSold.compareTo(BigDecimal.ZERO) == 0) {
            totalCostOfGoodsSold = calculateTotalCostFromItems(sales);
        }

        BigDecimal grossProfit = totalSales.subtract(totalCostOfGoodsSold);
        double profitMargin = totalSales.compareTo(BigDecimal.ZERO) > 0 ?
                grossProfit.divide(totalSales, 4, RoundingMode.HALF_UP).doubleValue() * 100 : 0;

        int totalItemsSold = sales.stream()
                .flatMap(sale -> sale.getItems().stream())
                .mapToInt(SaleItem::getQuantity)
                .sum();

        List<Object[]> paymentMethodData = saleRepository.getSalesByPaymentMethod(startDateTime, endDateTime);
        Map<String, BigDecimal> byPaymentMethod = new HashMap<>();
        for (Object[] data : paymentMethodData) {
            PaymentMethod method = (PaymentMethod) data[0];
            BigDecimal amount = (BigDecimal) data[1];
            byPaymentMethod.put(method.name(), amount);
        }

        List<Object[]> dailyData = saleRepository.getDailySales(startDateTime, endDateTime);
        List<SalesSummary.DailySales> dailyBreakdown = dailyData.stream()
                .map(data -> {
                    try {
                        LocalDate date;
                        if (data[0] instanceof java.sql.Date) {
                            date = ((java.sql.Date) data[0]).toLocalDate();
                        } else if (data[0] instanceof java.sql.Timestamp) {
                            date = ((java.sql.Timestamp) data[0]).toLocalDateTime().toLocalDate();
                        } else if (data[0] instanceof LocalDateTime) {
                            date = ((LocalDateTime) data[0]).toLocalDate();
                        } else {
                            date = LocalDate.parse(data[0].toString());
                        }

                        BigDecimal dailySalesAmount = (BigDecimal) data[1];

                        LocalDateTime dayStart = date.atStartOfDay();
                        LocalDateTime dayEnd = date.atTime(LocalTime.MAX);
                        List<Sale> dailySales = saleRepository.findByDate(dayStart, dayEnd);

                        BigDecimal dailyCost = calculateTotalCostFromItems(dailySales);
                        BigDecimal dailyProfit = dailySalesAmount.subtract(dailyCost);
                        int dailyTransactions = dailySales.size();

                        return SalesSummary.DailySales.builder()
                                .date(date)
                                .sales(dailySalesAmount)
                                .profit(dailyProfit)
                                .transactions(dailyTransactions)
                                .build();
                    } catch (Exception e) {
                        log.warn("Error parsing daily sales data: {}", e.getMessage());
                        return SalesSummary.DailySales.builder()
                                .date(LocalDate.now())
                                .sales(BigDecimal.ZERO)
                                .profit(BigDecimal.ZERO)
                                .transactions(0)
                                .build();
                    }
                })
                .collect(Collectors.toList());

        log.info("Sales Summary: Total Sales = {}, COGS = {}, Profit = {}, Items = {}",
                totalSales, totalCostOfGoodsSold, grossProfit, totalItemsSold);

        return SalesSummary.builder()
                .totalSales(totalSales)
                .totalCost(totalCostOfGoodsSold)
                .grossProfit(grossProfit)
                .profitMargin(profitMargin)
                .itemsSold(totalItemsSold)
                .byPaymentMethod(byPaymentMethod)
                .dailyBreakdown(dailyBreakdown)
                .build();
    }

    private BigDecimal calculateTotalCostFromItems(List<Sale> sales) {
        BigDecimal totalCost = BigDecimal.ZERO;

        for (Sale sale : sales) {
            for (SaleItem item : sale.getItems()) {
                if (item.getCostOfGoodsSold() != null) {
                    totalCost = totalCost.add(item.getCostOfGoodsSold());
                } else if (item.getCostPrice() != null) {
                    BigDecimal itemCost = item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                    totalCost = totalCost.add(itemCost);
                }
            }
        }

        return totalCost;
    }

    public DashboardSummary getTodaySalesSummary(UUID cashierId) {
        LocalDate today = LocalDate.now();
        LocalDateTime startOfDay = today.atStartOfDay();
        LocalDateTime endOfDay = today.atTime(LocalTime.MAX);

        BigDecimal totalAmount;
        long totalTransactions;
        BigDecimal totalProfit = BigDecimal.ZERO;

        if (cashierId != null) {
            totalAmount = saleRepository.getTotalSalesForDateAndCashier(startOfDay, endOfDay, cashierId);
            if (totalAmount == null) totalAmount = BigDecimal.ZERO;

            List<Sale> cashierSales = saleRepository.findByDateAndCashier(startOfDay, endOfDay, cashierId);
            totalTransactions = cashierSales != null ? cashierSales.size() : 0;

            totalProfit = calculateProfitForSales(cashierSales);
        } else {
            totalAmount = saleRepository.getTotalSalesForDate(startOfDay, endOfDay);
            if (totalAmount == null) totalAmount = BigDecimal.ZERO;

            totalTransactions = saleRepository.countSalesForDate(startOfDay, endOfDay);

            List<Sale> todaySales = saleRepository.findByDate(startOfDay, endOfDay);
            totalProfit = calculateProfitForSales(todaySales);
        }

        return DashboardSummary.builder()
                .todaySales(totalAmount)
                .todayTransactions((int) totalTransactions)
                .todayProfit(totalProfit)
                .totalStockItems(0)
                .lowStockCount(0)
                .expiringCount(0)
                .pendingOrders(0)
                .pendingExpenses(0)
                .pendingPrescriptions(0)
                .build();
    }

    private BigDecimal calculateProfitForSales(List<Sale> sales) {
        if (sales == null || sales.isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal totalRevenue = BigDecimal.ZERO;
        BigDecimal totalCost = BigDecimal.ZERO;

        for (Sale sale : sales) {
            totalRevenue = totalRevenue.add(sale.getTotal());

            if (sale.getCostOfGoodsSold() != null) {
                totalCost = totalCost.add(sale.getCostOfGoodsSold());
            } else {
                for (SaleItem item : sale.getItems()) {
                    BigDecimal itemCost = item.getCostOfGoodsSold() != null ?
                            item.getCostOfGoodsSold() :
                            (item.getCostPrice() != null ?
                                    item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity())) :
                                    BigDecimal.ZERO);
                    totalCost = totalCost.add(itemCost);
                }
            }
        }

        return totalRevenue.subtract(totalCost);
    }

    public List<SaleResponse> getSalesByCashier(UUID cashierId) {
        User cashier = userRepository.findById(cashierId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", cashierId));

        Page<Sale> salesPage = saleRepository.findSalesByCriteria(
                null, null, cashierId, null, PageRequest.of(0, 100));

        return salesPage.getContent()
                .stream()
                .map(this::mapToSaleResponse)
                .collect(Collectors.toList());
    }

    public List<SaleResponse> getCashierTodaySales(UUID cashierId) {
        LocalDate today = LocalDate.now();
        LocalDateTime startOfDay = today.atStartOfDay();
        LocalDateTime endOfDay = today.atTime(LocalTime.MAX);

        List<Sale> todaySales = saleRepository.findByDateAndCashier(startOfDay, endOfDay, cashierId);

        if (todaySales == null) {
            return new ArrayList<>();
        }

        return todaySales.stream()
                .map(this::mapToSaleResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteSale(UUID id) {
        Sale sale = saleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Sale", "id", id));

        saleRepository.delete(sale);
        log.info("Sale deleted with ID: {}", id);
    }

    public BigDecimal getTotalSalesForPeriod(LocalDate startDate, LocalDate endDate) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        return sales.stream()
                .map(Sale::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public long countSalesForPeriod(LocalDate startDate, LocalDate endDate) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        return saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null, PageRequest.of(0, 1)).getTotalElements();
    }

    private SaleResponse mapToSaleResponse(Sale sale) {
        SaleResponse response = SaleResponse.builder()
                .id(sale.getId())
                .subtotal(sale.getSubtotal())
                .discount(sale.getDiscount())
                .tax(sale.getTax())
                .total(sale.getTotal())
                .paymentMethod(sale.getPaymentMethod())
                .cashierId(sale.getCashier() != null ? sale.getCashier().getId() : null)
                .cashierName(sale.getCashierName())
                .customerName(sale.getCustomerName())
                .customerPhone(sale.getCustomerPhone())
                .createdAt(sale.getCreatedAt())
                .build();

        List<SaleResponse.SaleItemResponse> itemResponses = sale.getItems().stream()
                .map(item -> SaleResponse.SaleItemResponse.builder()
                        .medicineId(item.getMedicine() != null ? item.getMedicine().getId() : null)
                        .medicineName(item.getMedicineName())
                        .unitType(item.getUnitType().getValue())
                        .quantity(item.getQuantity())
                        .unitPrice(item.getUnitPrice())
                        .totalPrice(item.getTotalPrice())
                        .costPrice(item.getCostPrice())
                        .profit(item.calculateItemProfit())
                        .build())
                .collect(Collectors.toList());
        response.setItems(itemResponses);

        return response;
    }
}