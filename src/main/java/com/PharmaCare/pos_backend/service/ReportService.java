package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.response.*;
import com.PharmaCare.pos_backend.enums.ExpenseStatus;
import com.PharmaCare.pos_backend.enums.PaymentMethod;
import com.PharmaCare.pos_backend.enums.PrescriptionStatus;
import com.PharmaCare.pos_backend.enums.PurchaseOrderStatus;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.model.Sale;
import com.PharmaCare.pos_backend.model.SaleItem;
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
        BigDecimal todaySales = saleRepository.getTotalSalesForDate(startOfDay, endOfDay);
        long todayTransactions = saleRepository.countSalesForDate(startOfDay, endOfDay);

        // Calculate actual profit for today
        List<Sale> todaySalesList = saleRepository.findByDate(startOfDay, endOfDay);
        BigDecimal todayProfit = calculateProfitForSales(todaySalesList);

        // Stock information
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

        // Get sales for the period
        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        // Calculate totals
        BigDecimal totalSales = sales.stream()
                .map(Sale::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Calculate actual total cost from sold items
        BigDecimal totalCost = BigDecimal.ZERO;
        int totalItemsSold = 0;

        for (Sale sale : sales) {
            for (SaleItem item : sale.getItems()) {
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

        // Get sales by payment method
        List<Object[]> paymentMethodData = saleRepository.getSalesByPaymentMethod(startDateTime, endDateTime);
        Map<String, BigDecimal> byPaymentMethod = new HashMap<>();
        for (Object[] data : paymentMethodData) {
            PaymentMethod method = (PaymentMethod) data[0];
            BigDecimal amount = (BigDecimal) data[1];
            byPaymentMethod.put(method.name(), amount);
        }

        // Get daily breakdown with actual profit calculation
        List<Object[]> dailyData = saleRepository.getDailySales(startDateTime, endDateTime);
        List<SalesSummary.DailySales> dailyBreakdown = dailyData.stream()
                .map(data -> {
                    try {
                        LocalDate date = ((java.sql.Date) data[0]).toLocalDate();
                        BigDecimal dailySalesAmount = (BigDecimal) data[1];

                        // Get sales for this specific day
                        LocalDateTime dayStart = date.atStartOfDay();
                        LocalDateTime dayEnd = date.atTime(LocalTime.MAX);
                        List<Sale> dailySales = saleRepository.findByDate(dayStart, dayEnd);

                        // Calculate actual profit for this day
                        BigDecimal dailyCost = BigDecimal.ZERO;
                        int dailyTransactions = 0;

                        for (Sale sale : dailySales) {
                            for (SaleItem item : sale.getItems()) {
                                BigDecimal itemCost = item.getCostPrice() != null ?
                                        item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity())) :
                                        BigDecimal.ZERO;
                                dailyCost = dailyCost.add(itemCost);
                            }
                            dailyTransactions++;
                        }

                        BigDecimal dailyProfit = dailySalesAmount.subtract(dailyCost);

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

        // Get sales by category
        List<SalesSummary.CategorySales> byCategory = new ArrayList<>();

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

    public StockSummary getStockSummary() {
        // Get total items and quantity
        long totalItems = medicineRepository.countByActiveTrue();
        Long totalQuantity = medicineRepository.sumStockQuantity();

        // Calculate total value based on cost price, not selling price
        BigDecimal totalValue = BigDecimal.ZERO;
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue(PageRequest.of(0, Integer.MAX_VALUE)).getContent();
        for (Medicine medicine : allMedicines) {
            BigDecimal medicineValue = medicine.getCostPrice() != null ?
                    medicine.getCostPrice().multiply(BigDecimal.valueOf(medicine.getStockQuantity())) :
                    BigDecimal.ZERO;
            totalValue = totalValue.add(medicineValue);
        }

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
                        .value(medicine.getCostPrice() != null ?
                                BigDecimal.valueOf(medicine.getStockQuantity()).multiply(medicine.getCostPrice()) :
                                BigDecimal.ZERO)
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
                        .value(medicine.getCostPrice() != null ?
                                BigDecimal.valueOf(medicine.getStockQuantity()).multiply(medicine.getCostPrice()) :
                                BigDecimal.ZERO)
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
        BigDecimal cash = BigDecimal.valueOf(500000);
        BigDecimal inventory = BigDecimal.valueOf(2500000);
        BigDecimal accountsReceivable = BigDecimal.valueOf(150000);
        BigDecimal currentAssetsTotal = cash.add(inventory).add(accountsReceivable);

        BigDecimal equipment = BigDecimal.valueOf(500000);
        BigDecimal furniture = BigDecimal.valueOf(200000);
        BigDecimal fixedAssetsTotal = equipment.add(furniture);

        BigDecimal totalAssets = currentAssetsTotal.add(fixedAssetsTotal);

        // Liabilities
        BigDecimal accountsPayable = BigDecimal.valueOf(300000);
        BigDecimal taxPayable = BigDecimal.valueOf(50000);
        BigDecimal currentLiabilitiesTotal = accountsPayable.add(taxPayable);

        BigDecimal loans = BigDecimal.valueOf(500000);
        BigDecimal longTermLiabilitiesTotal = loans;

        BigDecimal totalLiabilities = currentLiabilitiesTotal.add(longTermLiabilitiesTotal);

        // Equity
        BigDecimal capital = BigDecimal.valueOf(2500000);
        BigDecimal retainedEarnings = BigDecimal.valueOf(500000);
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
        // Revenue from actual sales
        BigDecimal sales = getTotalSalesForPeriod(startDate, endDate);
        BigDecimal otherIncome = BigDecimal.valueOf(10000);
        BigDecimal totalRevenue = sales.add(otherIncome);

        // Actual Cost of Goods Sold from sold items
        BigDecimal costOfGoodsSold = getActualCostOfGoodsSold(startDate, endDate);

        // Gross Profit
        BigDecimal grossProfit = totalRevenue.subtract(costOfGoodsSold);

        // Operating Expenses
        BigDecimal salaries = BigDecimal.valueOf(200000);
        BigDecimal rent = BigDecimal.valueOf(50000);
        BigDecimal utilities = BigDecimal.valueOf(15000);
        BigDecimal supplies = BigDecimal.valueOf(10000);
        BigDecimal marketing = BigDecimal.valueOf(5000);
        BigDecimal other = BigDecimal.valueOf(5000);
        BigDecimal totalOperatingExpenses = salaries.add(rent).add(utilities)
                .add(supplies).add(marketing).add(other);

        // Operating Profit
        BigDecimal operatingProfit = grossProfit.subtract(totalOperatingExpenses);

        // Taxes
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

    private BigDecimal getActualCostOfGoodsSold(LocalDate startDate, LocalDate endDate) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        BigDecimal totalCost = BigDecimal.ZERO;
        for (Sale sale : sales) {
            for (SaleItem item : sale.getItems()) {
                BigDecimal itemCost = item.getCostPrice() != null ?
                        item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity())) :
                        BigDecimal.ZERO;
                totalCost = totalCost.add(itemCost);
            }
        }

        return totalCost;
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
}