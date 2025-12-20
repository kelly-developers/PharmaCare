package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.response.*;
import com.PharmaCare.pos_backend.enums.ExpenseStatus;
import com.PharmaCare.pos_backend.enums.PaymentMethod;
import com.PharmaCare.pos_backend.enums.PrescriptionStatus;
import com.PharmaCare.pos_backend.enums.PurchaseOrderStatus;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.model.Sale;
import com.PharmaCare.pos_backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReportService {

    private final SaleRepository saleRepository;
    private final ExpenseRepository expenseRepository;
    private final MedicineRepository medicineRepository;
    private final PurchaseOrderRepository purchaseOrderRepository;
    private final PrescriptionRepository prescriptionRepository;
    private final UserRepository userRepository;
    private final EmployeeRepository employeeRepository;
    private final SupplierRepository supplierRepository;
    private final CategoryRepository categoryRepository;

    public DashboardSummary getDashboardSummary() {
        LocalDate today = LocalDate.now();
        LocalDateTime startOfDay = today.atStartOfDay();
        LocalDateTime endOfDay = today.atTime(LocalTime.MAX);

        // Today's sales
        BigDecimal todaySales = saleRepository.getTotalSalesForDate(today);
        long todayTransactions = saleRepository.countSalesForDate(today);

        // Today's profit (simplified - assuming 30% profit margin)
        BigDecimal todayProfit = todaySales != null ?
                todaySales.multiply(BigDecimal.valueOf(0.3)) : BigDecimal.ZERO;

        // Stock information
        // FIXED: Changed from countByIsActiveTrue() to countByActiveTrue()
        long totalStockItems = medicineRepository.countByActiveTrue();

        // Low stock items (below reorder level)
        int lowStockCount = medicineRepository.findLowStockItems(
                        PageRequest.of(0, 100))
                .getNumberOfElements();

        // Expiring items (within 90 days)
        LocalDate expiryThreshold = LocalDate.now().plusDays(90);
        int expiringCount = medicineRepository.findExpiringItems(expiryThreshold,
                PageRequest.of(0, 100)).getNumberOfElements();

        // Pending orders
        long pendingOrders = purchaseOrderRepository.countByStatus(
                PurchaseOrderStatus.PENDING);

        // Pending expenses
        long pendingExpenses = expenseRepository.countByStatus(
                ExpenseStatus.PENDING);

        // Pending prescriptions
        long pendingPrescriptions = prescriptionRepository.countByStatus(
                PrescriptionStatus.PENDING);

        return DashboardSummary.builder()
                .todaySales(todaySales != null ? todaySales : BigDecimal.ZERO)
                .todayTransactions((int) todayTransactions)
                .todayProfit(todayProfit)
                .totalStockItems((int) totalStockItems)
                .lowStockCount(lowStockCount)
                .expiringCount(expiringCount)
                .pendingOrders((int) pendingOrders)
                .pendingExpenses((int) pendingExpenses)
                .pendingPrescriptions((int) pendingPrescriptions)
                .build();
    }

    public SalesSummary getSalesSummary(LocalDate startDate, LocalDate endDate, String groupBy) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        // Get total sales for the period
        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        // Calculate totals
        BigDecimal totalSales = sales.stream()
                .map(Sale::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Calculate total cost (simplified - would need actual cost from sale items)
        BigDecimal totalCost = totalSales.multiply(BigDecimal.valueOf(0.7)); // Assuming 70% cost

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
                        .profit(((BigDecimal) data[1]).multiply(BigDecimal.valueOf(0.3))) // 30% profit
                        .transactions(0) // Would need to count transactions per day
                        .build())
                .collect(Collectors.toList());

        // Get sales by category (simplified - would need proper category grouping)
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

    public StockSummary getStockSummary() {
        // Get total items and quantity
        // FIXED: Changed from countByIsActiveTrue() to countByActiveTrue()
        long totalItems = medicineRepository.countByActiveTrue();
        Long totalQuantity = medicineRepository.sumStockQuantity();

        // Calculate total value (simplified - would need actual stock value calculation)
        BigDecimal totalValue = BigDecimal.valueOf(totalQuantity != null ? totalQuantity : 0)
                .multiply(BigDecimal.valueOf(50)); // Assuming average price of 50 KES per unit

        // Get low stock items
        List<Medicine> lowStockItems =
                medicineRepository.findLowStockItems(
                                PageRequest.of(0, 50))
                        .getContent();

        List<StockSummary.StockItem> lowStockItemResponses = lowStockItems.stream()
                .map(medicine -> StockSummary.StockItem.builder()
                        .medicineId(medicine.getId().toString())
                        .medicineName(medicine.getName())
                        .category(medicine.getCategory())
                        .stockQuantity(medicine.getStockQuantity())
                        .reorderLevel(medicine.getReorderLevel())
                        .value(BigDecimal.valueOf(medicine.getStockQuantity())
                                .multiply(medicine.getCostPrice()))
                        .build())
                .collect(Collectors.toList());

        // Get out of stock items (stock = 0)
        List<Medicine> outOfStockItems =
                medicineRepository.searchMedicines(null, null,
                                PageRequest.of(0, 50)).getContent()
                        .stream()
                        .filter(medicine -> medicine.getStockQuantity() == 0)
                        .collect(Collectors.toList());

        List<StockSummary.StockItem> outOfStockItemResponses = outOfStockItems.stream()
                .map(medicine -> StockSummary.StockItem.builder()
                        .medicineId(medicine.getId().toString())
                        .medicineName(medicine.getName())
                        .category(medicine.getCategory())
                        .stockQuantity(0)
                        .reorderLevel(medicine.getReorderLevel())
                        .value(BigDecimal.ZERO)
                        .build())
                .collect(Collectors.toList());

        // Get expiring items (within 90 days)
        LocalDate expiryThreshold = LocalDate.now().plusDays(90);
        List<Medicine> expiringItems =
                medicineRepository.findExpiringItems(expiryThreshold,
                        PageRequest.of(0, 50)).getContent();

        List<StockSummary.StockItem> expiringItemResponses = expiringItems.stream()
                .map(medicine -> StockSummary.StockItem.builder()
                        .medicineId(medicine.getId().toString())
                        .medicineName(medicine.getName())
                        .category(medicine.getCategory())
                        .stockQuantity(medicine.getStockQuantity())
                        .reorderLevel(medicine.getReorderLevel())
                        .value(BigDecimal.valueOf(medicine.getStockQuantity())
                                .multiply(medicine.getCostPrice()))
                        .build())
                .collect(Collectors.toList());

        // Get stock by category
        List<Object[]> categoryData = medicineRepository.countByCategory();
        List<StockSummary.CategoryStock> byCategory = categoryData.stream()
                .map(data -> StockSummary.CategoryStock.builder()
                        .category((String) data[0])
                        .count(((Long) data[1]).intValue())
                        .quantity(0) // Would need to calculate total quantity per category
                        .value(BigDecimal.ZERO) // Would need to calculate value per category
                        .build())
                .collect(Collectors.toList());

        return StockSummary.builder()
                .totalItems((int) totalItems)
                .totalQuantity(totalQuantity != null ? totalQuantity.intValue() : 0)
                .totalValue(totalValue)
                .lowStockItems(lowStockItemResponses)
                .outOfStockItems(outOfStockItemResponses)
                .expiringItems(expiringItemResponses)
                .byCategory(byCategory)
                .build();
    }

    public BalanceSheet getBalanceSheet(LocalDate asOf) {
        // Assets
        BigDecimal cash = BigDecimal.valueOf(500000); // Example value
        BigDecimal inventory = BigDecimal.valueOf(2500000); // Example value
        BigDecimal accountsReceivable = BigDecimal.valueOf(150000); // Example value
        BigDecimal currentAssetsTotal = cash.add(inventory).add(accountsReceivable);

        BigDecimal equipment = BigDecimal.valueOf(500000); // Example value
        BigDecimal furniture = BigDecimal.valueOf(200000); // Example value
        BigDecimal fixedAssetsTotal = equipment.add(furniture);

        BigDecimal totalAssets = currentAssetsTotal.add(fixedAssetsTotal);

        // Liabilities
        BigDecimal accountsPayable = BigDecimal.valueOf(300000); // Example value
        BigDecimal taxPayable = BigDecimal.valueOf(50000); // Example value
        BigDecimal currentLiabilitiesTotal = accountsPayable.add(taxPayable);

        BigDecimal loans = BigDecimal.valueOf(500000); // Example value
        BigDecimal longTermLiabilitiesTotal = loans;

        BigDecimal totalLiabilities = currentLiabilitiesTotal.add(longTermLiabilitiesTotal);

        // Equity
        BigDecimal capital = BigDecimal.valueOf(2500000); // Example value
        BigDecimal retainedEarnings = BigDecimal.valueOf(500000); // Example value
        BigDecimal totalEquity = capital.add(retainedEarnings);

        return BalanceSheet.builder()
                .asOf(asOf)
                .assets(BalanceSheet.Assets.builder()
                        .currentAssets(BalanceSheet.CurrentAssets.builder()
                                .cash(cash)
                                .inventory(inventory)
                                .accountsReceivable(accountsReceivable)
                                .total(currentAssetsTotal)
                                .build())
                        .fixedAssets(BalanceSheet.FixedAssets.builder()
                                .equipment(equipment)
                                .furniture(furniture)
                                .total(fixedAssetsTotal)
                                .build())
                        .totalAssets(totalAssets)
                        .build())
                .liabilities(BalanceSheet.Liabilities.builder()
                        .currentLiabilities(BalanceSheet.CurrentLiabilities.builder()
                                .accountsPayable(accountsPayable)
                                .taxPayable(taxPayable)
                                .total(currentLiabilitiesTotal)
                                .build())
                        .longTermLiabilities(BalanceSheet.LongTermLiabilities.builder()
                                .loans(loans)
                                .total(longTermLiabilitiesTotal)
                                .build())
                        .totalLiabilities(totalLiabilities)
                        .build())
                .equity(BalanceSheet.Equity.builder()
                        .capital(capital)
                        .retainedEarnings(retainedEarnings)
                        .totalEquity(totalEquity)
                        .build())
                .totalLiabilitiesAndEquity(totalLiabilities.add(totalEquity))
                .build();
    }

    public IncomeStatement getIncomeStatement(LocalDate startDate, LocalDate endDate) {
        // Revenue
        BigDecimal sales = getTotalSalesForPeriod(startDate, endDate);
        BigDecimal otherIncome = BigDecimal.valueOf(10000); // Example value
        BigDecimal totalRevenue = sales.add(otherIncome);

        // Cost of Goods Sold (simplified - 70% of sales)
        BigDecimal costOfGoodsSold = sales.multiply(BigDecimal.valueOf(0.7));

        // Gross Profit
        BigDecimal grossProfit = totalRevenue.subtract(costOfGoodsSold);

        // Operating Expenses
        BigDecimal salaries = BigDecimal.valueOf(200000); // Example value
        BigDecimal rent = BigDecimal.valueOf(50000); // Example value
        BigDecimal utilities = BigDecimal.valueOf(15000); // Example value
        BigDecimal supplies = BigDecimal.valueOf(10000); // Example value
        BigDecimal marketing = BigDecimal.valueOf(5000); // Example value
        BigDecimal other = BigDecimal.valueOf(5000); // Example value
        BigDecimal totalOperatingExpenses = salaries.add(rent).add(utilities)
                .add(supplies).add(marketing).add(other);

        // Operating Profit
        BigDecimal operatingProfit = grossProfit.subtract(totalOperatingExpenses);

        // Taxes (simplified - 15% of operating profit)
        BigDecimal taxes = operatingProfit.multiply(BigDecimal.valueOf(0.15));

        // Net Profit
        BigDecimal netProfit = operatingProfit.subtract(taxes);

        return IncomeStatement.builder()
                .period(IncomeStatement.DateRange.builder()
                        .start(startDate)
                        .end(endDate)
                        .build())
                .revenue(IncomeStatement.Revenue.builder()
                        .sales(sales)
                        .otherIncome(otherIncome)
                        .totalRevenue(totalRevenue)
                        .build())
                .costOfGoodsSold(costOfGoodsSold)
                .grossProfit(grossProfit)
                .operatingExpenses(IncomeStatement.OperatingExpenses.builder()
                        .salaries(salaries)
                        .rent(rent)
                        .utilities(utilities)
                        .supplies(supplies)
                        .marketing(marketing)
                        .other(other)
                        .total(totalOperatingExpenses)
                        .build())
                .operatingProfit(operatingProfit)
                .taxes(taxes)
                .netProfit(netProfit)
                .build();
    }

    private BigDecimal getTotalSalesForPeriod(LocalDate startDate, LocalDate endDate) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        return sales.stream()
                .map(Sale::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}