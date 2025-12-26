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
import com.PharmaCare.pos_backend.exception.UnauthorizedException;
import com.PharmaCare.pos_backend.repository.SaleRepository;
import com.PharmaCare.pos_backend.repository.SaleItemRepository;
import com.PharmaCare.pos_backend.repository.UserRepository;
import com.PharmaCare.pos_backend.repository.MedicineRepository;
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

    @Transactional
    public SaleResponse createSale(SaleRequest request) {
        // Validate cashier exists
        User cashier = userRepository.findById(request.getCashierId())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getCashierId()));

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

        // Create sale items and update stock
        List<SaleItem> saleItems = new ArrayList<>();
        for (SaleRequest.SaleItemRequest itemRequest : request.getItems()) {
            // Validate medicine exists
            Medicine medicine = medicineRepository.findById(itemRequest.getMedicineId())
                    .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", itemRequest.getMedicineId()));

            // Get the actual cost price from medicine
            BigDecimal costPrice = medicine.getCostPrice() != null ? medicine.getCostPrice() : BigDecimal.ZERO;

            // Create sale item with correct cost price
            SaleItem saleItem = SaleItem.builder()
                    .sale(savedSale)
                    .medicine(medicine)
                    .medicineName(itemRequest.getMedicineName())
                    .unitType(UnitType.fromString(itemRequest.getUnitType()))
                    .quantity(itemRequest.getQuantity())
                    .unitPrice(itemRequest.getUnitPrice())
                    .totalPrice(itemRequest.getTotalPrice())
                    .costPrice(costPrice) // Store actual cost price from medicine
                    .build();

            saleItems.add(saleItem);

            // Deduct stock
            StockDeductionRequest deductionRequest = new StockDeductionRequest(
                    itemRequest.getQuantity(),
                    itemRequest.getUnitType(),
                    savedSale.getId().toString(),
                    request.getCashierId().toString(),
                    cashier.getRole().name()
            );

            try {
                stockService.deductStock(itemRequest.getMedicineId(), deductionRequest);
            } catch (Exception e) {
                saleRepository.delete(savedSale);
                throw new ApiException("Failed to deduct stock for medicine: " + itemRequest.getMedicineName(),
                        e, HttpStatus.BAD_REQUEST);
            }
        }

        saleItemRepository.saveAll(saleItems);
        savedSale.setItems(saleItems);

        log.info("Sale created with ID: {} by cashier: {}", savedSale.getId(), cashier.getName());
        return mapToSaleResponse(savedSale);
    }

    public SalesSummary getSalesSummary(LocalDate startDate, LocalDate endDate, String groupBy) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null, PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        BigDecimal totalSales = sales.stream()
                .map(Sale::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Calculate total cost based ONLY on sold items
        BigDecimal totalCost = BigDecimal.ZERO;
        int totalItemsSold = 0;

        for (Sale sale : sales) {
            for (SaleItem item : sale.getItems()) {
                // Multiply cost price by quantity sold
                BigDecimal itemCost = item.getCostPrice() != null ?
                        item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity())) :
                        BigDecimal.ZERO;
                totalCost = totalCost.add(itemCost);
                totalItemsSold += item.getQuantity();
            }
        }

        BigDecimal grossProfit = totalSales.subtract(totalCost);
        double profitMargin = totalSales.compareTo(BigDecimal.ZERO) > 0 ?
                grossProfit.divide(totalSales, 4, RoundingMode.HALF_UP).doubleValue() * 100 : 0;

        List<Object[]> paymentMethodData = saleRepository.getSalesByPaymentMethod(startDateTime, endDateTime);
        Map<String, BigDecimal> byPaymentMethod = new HashMap<>();
        for (Object[] data : paymentMethodData) {
            PaymentMethod method = (PaymentMethod) data[0];
            BigDecimal amount = (BigDecimal) data[1];
            byPaymentMethod.put(method.name(), amount);
        }

        // Get daily sales with correct profit calculation
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

                        // Get sales for this specific day to calculate actual profit
                        LocalDateTime dayStart = date.atStartOfDay();
                        LocalDateTime dayEnd = date.atTime(LocalTime.MAX);
                        List<Sale> dailySales = saleRepository.findByDate(dayStart, dayEnd);

                        BigDecimal dailyCost = BigDecimal.ZERO;
                        for (Sale sale : dailySales) {
                            for (SaleItem item : sale.getItems()) {
                                BigDecimal itemCost = item.getCostPrice() != null ?
                                        item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity())) :
                                        BigDecimal.ZERO;
                                dailyCost = dailyCost.add(itemCost);
                            }
                        }

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

        // Get top selling items with profit calculation
        List<Object[]> topItems = saleRepository.getTopSellingItems(startDateTime, endDateTime);
        List<SalesSummary.CategorySales> byCategory = new ArrayList<>();

        log.info("Sales Summary: Total Sales = {}, Total Cost = {}, Gross Profit = {}, Items Sold = {}",
                totalSales, totalCost, grossProfit, totalItemsSold);

        return SalesSummary.builder()
                .totalSales(totalSales)
                .totalCost(totalCost)
                .grossProfit(grossProfit)
                .profitMargin(profitMargin)
                .itemsSold(totalItemsSold)
                .byPaymentMethod(byPaymentMethod)
                .byCategory(byCategory)
                .dailyBreakdown(dailyBreakdown)
                .build();
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

            // Calculate actual profit for cashier's sales
            totalProfit = calculateProfitForSales(cashierSales);
        } else {
            totalAmount = saleRepository.getTotalSalesForDate(startOfDay, endOfDay);
            if (totalAmount == null) totalAmount = BigDecimal.ZERO;

            totalTransactions = saleRepository.countSalesForDate(startOfDay, endOfDay);

            List<Sale> todaySales = saleRepository.findByDate(startOfDay, endOfDay);
            totalProfit = calculateProfitForSales(todaySales);
        }

        List<Sale> todaySales = cashierId != null ?
                saleRepository.findByDateAndCashier(startOfDay, endOfDay, cashierId) :
                saleRepository.findByDate(startOfDay, endOfDay);

        Map<PaymentMethod, BigDecimal> paymentMethodAmounts = new HashMap<>();
        Map<PaymentMethod, Integer> paymentMethodCounts = new HashMap<>();

        if (todaySales != null) {
            for (Sale sale : todaySales) {
                paymentMethodAmounts.merge(sale.getPaymentMethod(), sale.getTotal(), BigDecimal::add);
                paymentMethodCounts.merge(sale.getPaymentMethod(), 1, Integer::sum);
            }
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
            for (SaleItem item : sale.getItems()) {
                BigDecimal itemCost = item.getCostPrice() != null ?
                        item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity())) :
                        BigDecimal.ZERO;
                totalCost = totalCost.add(itemCost);
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
                startDateTime, endDateTime, null, null, PageRequest.of(0, Integer.MAX_VALUE)).getContent();

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
                        .profit(item.getTotalPrice().subtract(
                                item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()))
                        )) // Calculate profit per item
                        .build())
                .collect(Collectors.toList());
        response.setItems(itemResponses);

        return response;
    }
}