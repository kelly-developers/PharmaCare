package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.SaleRequest;
import com.PharmaCare.pos_backend.dto.request.StockDeductionRequest;
import com.PharmaCare.pos_backend.dto.response.DashboardSummary;
import com.PharmaCare.pos_backend.dto.response.SalesSummary;
import com.PharmaCare.pos_backend.model.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.model.dto.response.SaleResponse;
import com.PharmaCare.pos_backend.model.entity.*;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.model.entity.UnitType;
import com.PharmaCare.pos_backend.repository.SaleRepository;
import com.PharmaCare.pos_backend.repository.SaleItemRepository;
import com.PharmaCare.pos_backend.repository.UserRepository;
import com.PharmaCare.pos_backend.repository.MedicineRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
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
    private final MedicineService medicineService;
    private final StockService stockService;
    private final ModelMapper modelMapper;

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
                .cashierName(cashier.getName())
                .customerName(request.getCustomerName())
                .customerPhone(request.getCustomerPhone())
                .createdAt(LocalDateTime.now())
                .build();

        Sale savedSale = saleRepository.save(sale);

        // Create sale items and deduct stock
        List<SaleItem> saleItems = new ArrayList<>();
        for (SaleRequest.SaleItemRequest itemRequest : request.getItems()) {
            // Fetch the medicine entity
            Medicine medicine = medicineRepository.findById(itemRequest.getMedicineId())
                    .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", itemRequest.getMedicineId()));

            // Create the SaleItem with all required fields
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

            // Create StockDeductionRequest (without medicineId)
            StockDeductionRequest deductionRequest = new StockDeductionRequest(
                    itemRequest.getQuantity(),
                    itemRequest.getUnitType(),
                    savedSale.getId(),
                    request.getCashierId(),
                    cashier.getRole().name()
            );

            try {
                // Pass medicineId separately and the deductionRequest
                stockService.deductStock(itemRequest.getMedicineId(), deductionRequest);
            } catch (Exception e) {
                // Rollback sale creation if stock deduction fails
                saleRepository.delete(savedSale);
                throw new ApiException("Failed to deduct stock for medicine: " + itemRequest.getMedicineName(),
                        e, HttpStatus.BAD_REQUEST);
            }
        }

        savedSale.setItems(saleItems);
        saleItemRepository.saveAll(saleItems);

        log.info("Sale created with ID: {}", savedSale.getId());
        return mapToSaleResponse(savedSale);
    }

    public SalesSummary getSalesSummary(LocalDate startDate, LocalDate endDate, String groupBy) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        // Get total sales and cost
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

        // Get sales by payment method
        List<Object[]> paymentMethodData = saleRepository.getSalesByPaymentMethod(startDateTime, endDateTime);
        Map<String, BigDecimal> byPaymentMethod = new HashMap<>();
        for (Object[] data : paymentMethodData) {
            PaymentMethod method = (PaymentMethod) data[0];
            BigDecimal amount = (BigDecimal) data[1];
            byPaymentMethod.put(method.name(), amount);
        }

        // Get daily breakdown
        List<Object[]> dailyData = saleRepository.getDailySales(startDateTime, endDateTime);
        List<SalesSummary.DailySales> dailyBreakdown = dailyData.stream()
                .map(data -> SalesSummary.DailySales.builder()
                        .date(((java.sql.Date) data[0]).toLocalDate())
                        .sales((BigDecimal) data[1])
                        .profit(((BigDecimal) data[1]).multiply(BigDecimal.valueOf(0.3)))
                        .transactions(0)
                        .build())
                .collect(Collectors.toList());

        // Get top selling items
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
        BigDecimal totalAmount;
        long totalTransactions;

        if (cashierId != null) {
            totalAmount = saleRepository.getTotalSalesForDateAndCashier(today, cashierId);
            totalTransactions = saleRepository.findByDateAndCashier(today, cashierId).size();
        } else {
            totalAmount = saleRepository.getTotalSalesForDate(today);
            totalTransactions = saleRepository.countSalesForDate(today);
        }

        // Get breakdown by payment method
        List<Sale> todaySales = cashierId != null ?
                saleRepository.findByDateAndCashier(today, cashierId) :
                saleRepository.findByDate(today);

        Map<PaymentMethod, BigDecimal> paymentMethodAmounts = new HashMap<>();
        Map<PaymentMethod, Integer> paymentMethodCounts = new HashMap<>();

        for (Sale sale : todaySales) {
            paymentMethodAmounts.merge(sale.getPaymentMethod(), sale.getTotal(), BigDecimal::add);
            paymentMethodCounts.merge(sale.getPaymentMethod(), 1, Integer::sum);
        }

        // Calculate profit (simplified - would need actual cost data)
        BigDecimal totalProfit = totalAmount != null ?
                totalAmount.multiply(BigDecimal.valueOf(0.3)) : BigDecimal.ZERO;

        return DashboardSummary.builder()
                .todaySales(totalAmount != null ? totalAmount : BigDecimal.ZERO)
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
        SaleResponse response = modelMapper.map(sale, SaleResponse.class);

        // Map sale items
        List<SaleResponse.SaleItemResponse> itemResponses = sale.getItems().stream()
                .map(item -> {
                    SaleResponse.SaleItemResponse itemResponse = new SaleResponse.SaleItemResponse();
                    itemResponse.setMedicineId(item.getMedicine() != null ? item.getMedicine().getId() : null);
                    itemResponse.setMedicineName(item.getMedicineName());
                    itemResponse.setUnitType(item.getUnitType().getValue());
                    itemResponse.setQuantity(item.getQuantity());
                    itemResponse.setUnitPrice(item.getUnitPrice());
                    itemResponse.setTotalPrice(item.getTotalPrice());
                    itemResponse.setCostPrice(item.getCostPrice());
                    return itemResponse;
                })
                .collect(Collectors.toList());
        response.setItems(itemResponses);

        if (sale.getCashier() != null) {
            response.setCashierId(sale.getCashier().getId());
        }
        response.setCashierName(sale.getCashierName());

        return response;
    }
}