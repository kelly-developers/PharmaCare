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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
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

            // Create sale item
            SaleItem saleItem = SaleItem.builder()
                    .sale(savedSale)
                    .medicine(medicine)
                    .medicineName(itemRequest.getMedicineName())
                    .unitType(UnitType.fromString(itemRequest.getUnitType()))
                    .quantity(itemRequest.getQuantity())
                    .unitPrice(itemRequest.getUnitPrice())
                    .totalPrice(itemRequest.getTotalPrice())
                    .costPrice(itemRequest.getCostPrice())
                    .build();

            saleItems.add(saleItem);

            // Deduct stock
            StockDeductionRequest deductionRequest = new StockDeductionRequest(
                    itemRequest.getQuantity(),
                    itemRequest.getUnitType(),
                    savedSale.getId().toString(), // Use String for referenceId
                    request.getCashierId(),
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

        BigDecimal totalCost = sales.stream()
                .flatMap(sale -> sale.getItems().stream())
                .map(item -> {
                    BigDecimal cost = item.getCostPrice() != null ? item.getCostPrice() : BigDecimal.ZERO;
                    return cost.multiply(BigDecimal.valueOf(item.getQuantity()));
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);

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

                        BigDecimal salesAmount = (BigDecimal) data[1];
                        return SalesSummary.DailySales.builder()
                                .date(date)
                                .sales(salesAmount)
                                .profit(salesAmount.multiply(BigDecimal.valueOf(0.3)))
                                .transactions(0)
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

        List<Object[]> topItems = saleRepository.getTopSellingItems(startDateTime, endDateTime);
        List<SalesSummary.CategorySales> byCategory = new ArrayList<>();

        return SalesSummary.builder()
                .totalSales(totalSales)
                .totalCost(totalCost)
                .grossProfit(grossProfit)
                .profitMargin(profitMargin)
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

        if (cashierId != null) {
            totalAmount = saleRepository.getTotalSalesForDateAndCashier(startOfDay, endOfDay, cashierId);
            if (totalAmount == null) totalAmount = BigDecimal.ZERO;

            List<Sale> cashierSales = saleRepository.findByDateAndCashier(startOfDay, endOfDay, cashierId);
            totalTransactions = cashierSales != null ? cashierSales.size() : 0;
        } else {
            totalAmount = saleRepository.getTotalSalesForDate(startOfDay, endOfDay);
            if (totalAmount == null) totalAmount = BigDecimal.ZERO;

            totalTransactions = saleRepository.countSalesForDate(startOfDay, endOfDay);
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

        BigDecimal totalProfit = totalAmount.multiply(BigDecimal.valueOf(0.3));

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
                        .build())
                .collect(Collectors.toList());
        response.setItems(itemResponses);

        return response;
    }
}