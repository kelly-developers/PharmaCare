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
import com.PharmaCare.pos_backend.util.StockCalculator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
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

        // Today's sales and profit
        BigDecimal todaySales = saleRepository.getTotalSalesForDate(startOfDay, endOfDay);
        long todayTransactions = saleRepository.countSalesForDate(startOfDay, endOfDay);
        List<Sale> todaySalesList = saleRepository.findByDate(startOfDay, endOfDay);
        BigDecimal todayProfit = calculateProfitForSales(todaySalesList);

        // Monthly profits
        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart = currentMonth.atDay(1);
        LocalDate monthEnd = currentMonth.atEndOfMonth();
        BigDecimal thisMonthProfit = calculateMonthlyProfit(monthStart, monthEnd);

        YearMonth lastMonth = currentMonth.minusMonths(1);
        LocalDate lastMonthStart = lastMonth.atDay(1);
        LocalDate lastMonthEnd = lastMonth.atEndOfMonth();
        BigDecimal lastMonthProfit = calculateMonthlyProfit(lastMonthStart, lastMonthEnd);

        // Stock information
        long totalStockItems = medicineRepository.countByActiveTrue();

        // Calculate low stock count
        int lowStockCount = calculateLowStockCountWithStock();

        // Calculate expiring count
        LocalDate expiryThreshold = LocalDate.now().plusDays(90);
        int expiringCount = countExpiringItemsWithStock(expiryThreshold);

        // Calculate out of stock count
        int outOfStockCount = countOutOfStockItems();

        // Pending counts
        long pendingOrders = purchaseOrderRepository.countByStatus(PurchaseOrderStatus.PENDING);
        long pendingExpenses = expenseRepository.countByStatus(ExpenseStatus.PENDING);
        long pendingPrescriptions = prescriptionRepository.countByStatus(PrescriptionStatus.PENDING);

        // Today's expenses - FIXED: Use LocalDate instead of LocalDateTime
        BigDecimal todayExpenses = expenseRepository.getTotalExpensesForPeriod(today, today);

        log.info("=== DASHBOARD SUMMARY FROM SERVICE ===");
        log.info("Today Sales: KSh {}", todaySales != null ? todaySales : BigDecimal.ZERO);
        log.info("Today Transactions: {}", todayTransactions);
        log.info("Today Profit: KSh {}", todayProfit);
        log.info("This Month Profit: KSh {}", thisMonthProfit);
        log.info("Last Month Profit: KSh {}", lastMonthProfit);
        log.info("Total Stock Items: {}", totalStockItems);
        log.info("Low Stock Count: {}", lowStockCount);
        log.info("Expiring Count: {}", expiringCount);
        log.info("Out of Stock Count: {}", outOfStockCount);
        log.info("Pending Orders: {}", pendingOrders);
        log.info("Today Expenses: KSh {}", todayExpenses);

        return DashboardSummary.builder()
                .todaySales(todaySales != null ? todaySales : BigDecimal.ZERO)
                .todayTransactions((int) todayTransactions)
                .todayProfit(todayProfit)
                .thisMonthProfit(thisMonthProfit)
                .lastMonthProfit(lastMonthProfit)
                .totalStockItems((int) totalStockItems)
                .lowStockCount(lowStockCount)
                .expiringCount(expiringCount)
                .expiringSoonCount(expiringCount)
                .outOfStockCount(outOfStockCount)
                .todayExpenses(todayExpenses != null ? todayExpenses : BigDecimal.ZERO)
                .pendingOrders((int) pendingOrders)
                .pendingExpenses((int) pendingExpenses)
                .pendingPrescriptions((int) pendingPrescriptions)
                .inventoryValue(BigDecimal.ZERO) // Will be calculated in controller
                .stockValue(BigDecimal.ZERO)    // Will be calculated in controller
                .build();
    }

    private int calculateLowStockCountWithStock() {
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

        int count = 0;
        for (Medicine medicine : allMedicines) {
            if (medicine.getStockQuantity() <= medicine.getReorderLevel()) {
                count++;
            }
        }
        return count;
    }

    private int countExpiringItemsWithStock(LocalDate expiryThreshold) {
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

        int count = 0;
        for (Medicine medicine : allMedicines) {
            LocalDate expiryDate = medicine.getExpiryDate();

            if (medicine.getStockQuantity() > 0 &&
                    expiryDate != null &&
                    expiryDate.isBefore(expiryThreshold)) {
                count++;
            }
        }
        return count;
    }

    private int countOutOfStockItems() {
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

        int count = 0;
        for (Medicine medicine : allMedicines) {
            if (medicine.getStockQuantity() == 0) {
                count++;
            }
        }
        return count;
    }

    public SalesSummary getSalesSummary(LocalDate startDate, LocalDate endDate, String groupBy) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        BigDecimal totalSales = BigDecimal.ZERO;
        BigDecimal totalCostOfGoodsSold = BigDecimal.ZERO;
        int totalItemsSold = 0;

        for (Sale sale : sales) {
            totalSales = totalSales.add(sale.getTotal() != null ? sale.getTotal() : BigDecimal.ZERO);

            if (sale.getCostOfGoodsSold() != null) {
                totalCostOfGoodsSold = totalCostOfGoodsSold.add(sale.getCostOfGoodsSold());
            } else {
                for (SaleItem item : sale.getItems()) {
                    if (item.getCostOfGoodsSold() != null) {
                        totalCostOfGoodsSold = totalCostOfGoodsSold.add(item.getCostOfGoodsSold());
                    } else if (item.getCostPrice() != null) {
                        BigDecimal itemCost = item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                        totalCostOfGoodsSold = totalCostOfGoodsSold.add(itemCost);
                    }
                    totalItemsSold += item.getQuantity();
                }
            }
        }

        BigDecimal grossProfit = totalSales.subtract(totalCostOfGoodsSold);
        double profitMargin = totalSales.compareTo(BigDecimal.ZERO) > 0 ?
                grossProfit.divide(totalSales, 4, RoundingMode.HALF_UP).doubleValue() * 100 : 0;

        List<Object[]> paymentMethodData = saleRepository.getSalesByPaymentMethod(startDateTime, endDateTime);
        Map<String, BigDecimal> byPaymentMethod = new HashMap<>();
        for (Object[] data : paymentMethodData) {
            PaymentMethod method = (PaymentMethod) data[0];
            BigDecimal amount = (BigDecimal) data[1];
            byPaymentMethod.put(method.name(), amount != null ? amount : BigDecimal.ZERO);
        }

        List<SalesSummary.DailySales> dailyBreakdown = getDailyBreakdown(startDate, endDate);
        List<SalesSummary.MonthlySales> monthlyBreakdown = getMonthlyBreakdown(startDate, endDate);
        List<SalesSummary.CategorySales> byCategory = calculateCategorySales(sales);

        log.info("Sales Summary: Total Sales = KSh {}, COGS = KSh {}, Gross Profit = KSh {}, Margin = {}%, Items Sold = {}",
                totalSales, totalCostOfGoodsSold, grossProfit, profitMargin, totalItemsSold);

        return SalesSummary.builder()
                .totalSales(totalSales)
                .totalCost(totalCostOfGoodsSold)
                .grossProfit(grossProfit)
                .profitMargin(profitMargin)
                .itemsSold(totalItemsSold)
                .byPaymentMethod(byPaymentMethod)
                .byCategory(byCategory)
                .dailyBreakdown(dailyBreakdown)
                .monthlyBreakdown(monthlyBreakdown)
                .build();
    }

    private List<SalesSummary.DailySales> getDailyBreakdown(LocalDate startDate, LocalDate endDate) {
        List<SalesSummary.DailySales> dailyBreakdown = new ArrayList<>();

        for (LocalDate date = startDate; !date.isAfter(endDate); date = date.plusDays(1)) {
            LocalDateTime dayStart = date.atStartOfDay();
            LocalDateTime dayEnd = date.atTime(LocalTime.MAX);

            List<Sale> dailySales = saleRepository.findByDate(dayStart, dayEnd);
            BigDecimal dailySalesAmount = BigDecimal.ZERO;
            BigDecimal dailyCostOfGoodsSold = BigDecimal.ZERO;
            int dailyTransactions = 0;

            for (Sale sale : dailySales) {
                dailySalesAmount = dailySalesAmount.add(sale.getTotal() != null ? sale.getTotal() : BigDecimal.ZERO);
                dailyTransactions++;

                if (sale.getCostOfGoodsSold() != null) {
                    dailyCostOfGoodsSold = dailyCostOfGoodsSold.add(sale.getCostOfGoodsSold());
                } else {
                    for (SaleItem item : sale.getItems()) {
                        if (item.getCostOfGoodsSold() != null) {
                            dailyCostOfGoodsSold = dailyCostOfGoodsSold.add(item.getCostOfGoodsSold());
                        } else if (item.getCostPrice() != null) {
                            BigDecimal itemCost = item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                            dailyCostOfGoodsSold = dailyCostOfGoodsSold.add(itemCost);
                        }
                    }
                }
            }

            BigDecimal dailyProfit = dailySalesAmount.subtract(dailyCostOfGoodsSold);

            dailyBreakdown.add(SalesSummary.DailySales.builder()
                    .date(date)
                    .sales(dailySalesAmount)
                    .profit(dailyProfit)
                    .transactions(dailyTransactions)
                    .build());
        }

        return dailyBreakdown;
    }

    private List<SalesSummary.MonthlySales> getMonthlyBreakdown(LocalDate startDate, LocalDate endDate) {
        List<SalesSummary.MonthlySales> monthlyBreakdown = new ArrayList<>();

        YearMonth startMonth = YearMonth.from(startDate);
        YearMonth endMonth = YearMonth.from(endDate);

        for (YearMonth month = startMonth; !month.isAfter(endMonth); month = month.plusMonths(1)) {
            LocalDate monthStart = month.atDay(1);
            LocalDate monthEnd = month.atEndOfMonth();

            if (month.equals(startMonth) && startDate.isAfter(monthStart)) {
                monthStart = startDate;
            }
            if (month.equals(endMonth) && endDate.isBefore(monthEnd)) {
                monthEnd = endDate;
            }

            LocalDateTime monthStartTime = monthStart.atStartOfDay();
            LocalDateTime monthEndTime = monthEnd.atTime(LocalTime.MAX);

            List<Sale> monthSales = saleRepository.findSalesByCriteria(
                    monthStartTime, monthEndTime, null, null,
                    PageRequest.of(0, Integer.MAX_VALUE)).getContent();

            BigDecimal monthSalesAmount = BigDecimal.ZERO;
            BigDecimal monthCostOfGoodsSold = BigDecimal.ZERO;
            int monthTransactions = 0;
            int monthItemsSold = 0;

            for (Sale sale : monthSales) {
                monthSalesAmount = monthSalesAmount.add(sale.getTotal() != null ? sale.getTotal() : BigDecimal.ZERO);
                monthTransactions++;

                if (sale.getCostOfGoodsSold() != null) {
                    monthCostOfGoodsSold = monthCostOfGoodsSold.add(sale.getCostOfGoodsSold());
                } else {
                    for (SaleItem item : sale.getItems()) {
                        if (item.getCostOfGoodsSold() != null) {
                            monthCostOfGoodsSold = monthCostOfGoodsSold.add(item.getCostOfGoodsSold());
                        } else if (item.getCostPrice() != null) {
                            BigDecimal itemCost = item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                            monthCostOfGoodsSold = monthCostOfGoodsSold.add(itemCost);
                        }
                        monthItemsSold += item.getQuantity();
                    }
                }
            }

            BigDecimal monthProfit = monthSalesAmount.subtract(monthCostOfGoodsSold);

            monthlyBreakdown.add(SalesSummary.MonthlySales.builder()
                    .month(month)
                    .sales(monthSalesAmount)
                    .cost(monthCostOfGoodsSold)
                    .profit(monthProfit)
                    .transactions(monthTransactions)
                    .itemsSold(monthItemsSold)
                    .build());
        }

        return monthlyBreakdown;
    }

    private List<SalesSummary.CategorySales> calculateCategorySales(List<Sale> sales) {
        Map<String, SalesSummary.CategorySales> categoryMap = new HashMap<>();

        for (Sale sale : sales) {
            for (SaleItem item : sale.getItems()) {
                String category = "Unknown";
                if (item.getMedicine() != null && item.getMedicine().getCategory() != null) {
                    category = item.getMedicine().getCategory();
                }

                BigDecimal itemPrice = BigDecimal.ZERO;
                if (item.getUnitPrice() != null) {
                    itemPrice = item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                }

                BigDecimal itemCost = BigDecimal.ZERO;
                if (item.getCostOfGoodsSold() != null) {
                    itemCost = item.getCostOfGoodsSold();
                } else if (item.getCostPrice() != null) {
                    itemCost = item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                }

                SalesSummary.CategorySales categorySales = categoryMap.get(category);
                if (categorySales == null) {
                    categorySales = SalesSummary.CategorySales.builder()
                            .category(category)
                            .amount(BigDecimal.ZERO)
                            .cost(BigDecimal.ZERO)
                            .profit(BigDecimal.ZERO)
                            .itemsSold(0)
                            .build();
                }

                categorySales.setAmount(categorySales.getAmount().add(itemPrice));
                categorySales.setCost(categorySales.getCost().add(itemCost));
                categorySales.setProfit(categorySales.getProfit().add(itemPrice.subtract(itemCost)));
                categorySales.setItemsSold(categorySales.getItemsSold() + item.getQuantity());

                categoryMap.put(category, categorySales);
            }
        }

        return new ArrayList<>(categoryMap.values());
    }

    public BigDecimal calculateMonthlyProfit(LocalDate startDate, LocalDate endDate) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        return calculateProfitForSales(sales);
    }

    public BigDecimal calculateDailyProfit(LocalDate date) {
        LocalDateTime startOfDay = date.atStartOfDay();
        LocalDateTime endOfDay = date.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findByDate(startOfDay, endOfDay);
        return calculateProfitForSales(sales);
    }

    public MonthlyProfitReport getMonthlyProfitReport(YearMonth yearMonth) {
        LocalDate monthStart = yearMonth.atDay(1);
        LocalDate monthEnd = yearMonth.atEndOfMonth();

        LocalDateTime startDateTime = monthStart.atStartOfDay();
        LocalDateTime endDateTime = monthEnd.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        BigDecimal totalSales = BigDecimal.ZERO;
        BigDecimal totalCostOfGoodsSold = BigDecimal.ZERO;
        int totalTransactions = 0;
        int totalItemsSold = 0;

        for (Sale sale : sales) {
            totalSales = totalSales.add(sale.getTotal() != null ? sale.getTotal() : BigDecimal.ZERO);
            totalTransactions++;

            if (sale.getCostOfGoodsSold() != null) {
                totalCostOfGoodsSold = totalCostOfGoodsSold.add(sale.getCostOfGoodsSold());
            } else {
                for (SaleItem item : sale.getItems()) {
                    if (item.getCostOfGoodsSold() != null) {
                        totalCostOfGoodsSold = totalCostOfGoodsSold.add(item.getCostOfGoodsSold());
                    } else if (item.getCostPrice() != null) {
                        BigDecimal itemCost = item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                        totalCostOfGoodsSold = totalCostOfGoodsSold.add(itemCost);
                    }
                    totalItemsSold += item.getQuantity();
                }
            }
        }

        BigDecimal totalProfit = totalSales.subtract(totalCostOfGoodsSold);

        List<DailyProfit> dailyProfits = new ArrayList<>();
        for (LocalDate date = monthStart; !date.isAfter(monthEnd); date = date.plusDays(1)) {
            DailyProfit dailyProfit = getDailyProfitDetails(date);
            dailyProfits.add(dailyProfit);
        }

        return MonthlyProfitReport.builder()
                .month(yearMonth)
                .totalSales(totalSales)
                .totalCost(totalCostOfGoodsSold)
                .totalProfit(totalProfit)
                .totalTransactions(totalTransactions)
                .totalItemsSold(totalItemsSold)
                .dailyProfits(dailyProfits)
                .build();
    }

    public DailyProfit getDailyProfitDetails(LocalDate date) {
        LocalDateTime startOfDay = date.atStartOfDay();
        LocalDateTime endOfDay = date.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findByDate(startOfDay, endOfDay);

        BigDecimal dailySales = BigDecimal.ZERO;
        BigDecimal dailyCostOfGoodsSold = BigDecimal.ZERO;
        int dailyTransactions = 0;
        int dailyItemsSold = 0;

        for (Sale sale : sales) {
            dailySales = dailySales.add(sale.getTotal() != null ? sale.getTotal() : BigDecimal.ZERO);
            dailyTransactions++;

            if (sale.getCostOfGoodsSold() != null) {
                dailyCostOfGoodsSold = dailyCostOfGoodsSold.add(sale.getCostOfGoodsSold());
            } else {
                for (SaleItem item : sale.getItems()) {
                    if (item.getCostOfGoodsSold() != null) {
                        dailyCostOfGoodsSold = dailyCostOfGoodsSold.add(item.getCostOfGoodsSold());
                    } else if (item.getCostPrice() != null) {
                        BigDecimal itemCost = item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                        dailyCostOfGoodsSold = dailyCostOfGoodsSold.add(itemCost);
                    }
                    dailyItemsSold += item.getQuantity();
                }
            }
        }

        BigDecimal dailyProfit = dailySales.subtract(dailyCostOfGoodsSold);

        return DailyProfit.builder()
                .date(date)
                .sales(dailySales)
                .cost(dailyCostOfGoodsSold)
                .profit(dailyProfit)
                .transactions(dailyTransactions)
                .itemsSold(dailyItemsSold)
                .build();
    }

    public ProfitSummary getProfitSummary() {
        LocalDate today = LocalDate.now();

        BigDecimal todayProfit = calculateDailyProfit(today);

        LocalDate weekStart = today.with(TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY));
        BigDecimal thisWeekProfit = calculateMonthlyProfit(weekStart, today);

        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart = currentMonth.atDay(1);
        LocalDate monthEnd = currentMonth.atEndOfMonth();
        BigDecimal thisMonthProfit = calculateMonthlyProfit(monthStart, today.isAfter(monthEnd) ? monthEnd : today);

        YearMonth lastMonth = currentMonth.minusMonths(1);
        LocalDate lastMonthStart = lastMonth.atDay(1);
        LocalDate lastMonthEnd = lastMonth.atEndOfMonth();
        BigDecimal lastMonthProfit = calculateMonthlyProfit(lastMonthStart, lastMonthEnd);

        LocalDate ytdStart = LocalDate.of(today.getYear(), 1, 1);
        BigDecimal ytdProfit = calculateMonthlyProfit(ytdStart, today);

        return ProfitSummary.builder()
                .todayProfit(todayProfit)
                .thisWeekProfit(thisWeekProfit)
                .thisMonthProfit(thisMonthProfit)
                .lastMonthProfit(lastMonthProfit)
                .ytdProfit(ytdProfit)
                .build();
    }

    private BigDecimal calculateProfitForSales(List<Sale> sales) {
        if (sales == null || sales.isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal totalRevenue = BigDecimal.ZERO;
        BigDecimal totalCostOfGoodsSold = BigDecimal.ZERO;

        for (Sale sale : sales) {
            totalRevenue = totalRevenue.add(sale.getTotal() != null ? sale.getTotal() : BigDecimal.ZERO);

            if (sale.getCostOfGoodsSold() != null) {
                totalCostOfGoodsSold = totalCostOfGoodsSold.add(sale.getCostOfGoodsSold());
            } else {
                for (SaleItem item : sale.getItems()) {
                    BigDecimal itemCost = item.getCostOfGoodsSold() != null ?
                            item.getCostOfGoodsSold() :
                            (item.getCostPrice() != null ?
                                    item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity())) :
                                    BigDecimal.ZERO);
                    totalCostOfGoodsSold = totalCostOfGoodsSold.add(itemCost);
                }
            }
        }

        return totalRevenue.subtract(totalCostOfGoodsSold);
    }

    public StockSummary getStockSummary() {
        long totalItems = medicineRepository.countByActiveTrue();
        Long totalQuantity = medicineRepository.sumStockQuantity();

        // Calculate total value based on SELLING price for dashboard
        BigDecimal totalValue = BigDecimal.ZERO;
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue(PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        for (Medicine medicine : allMedicines) {
            BigDecimal medicineValue = StockCalculator.calculateSellingStockValue(medicine);
            totalValue = totalValue.add(medicineValue);
        }

        List<Medicine> allActiveMedicines = medicineRepository.findByActiveTrue();

        List<Medicine> lowStockItems = allActiveMedicines.stream()
                .filter(medicine -> medicine.getStockQuantity() > 0 &&
                        medicine.getStockQuantity() <= medicine.getReorderLevel())
                .collect(Collectors.toList());

        List<StockSummary.StockItem> lowStockItemResponses = lowStockItems.stream()
                .map(medicine -> {
                    // For individual medicine display, show cost value
                    BigDecimal medicineCostValue = StockCalculator.calculateCostStockValue(medicine);
                    BigDecimal medicineSellingValue = StockCalculator.calculateSellingStockValue(medicine);

                    return StockSummary.StockItem.builder()
                            .medicineId(medicine.getId().toString())
                            .medicineName(medicine.getName())
                            .category(medicine.getCategory())
                            .stockQuantity(medicine.getStockQuantity())
                            .reorderLevel(medicine.getReorderLevel())
                            .costValue(medicineCostValue) // Cost value
                            .sellingValue(medicineSellingValue) // Selling value
                            .value(medicineSellingValue) // Default to selling value for compatibility
                            .build();
                })
                .collect(Collectors.toList());

        List<Medicine> outOfStockItems = allActiveMedicines.stream()
                .filter(medicine -> medicine.getStockQuantity() == 0)
                .collect(Collectors.toList());

        List<StockSummary.StockItem> outOfStockItemResponses = outOfStockItems.stream()
                .map(medicine -> StockSummary.StockItem.builder()
                        .medicineId(medicine.getId().toString())
                        .medicineName(medicine.getName())
                        .category(medicine.getCategory())
                        .stockQuantity(0)
                        .reorderLevel(medicine.getReorderLevel())
                        .costValue(BigDecimal.ZERO)
                        .sellingValue(BigDecimal.ZERO)
                        .value(BigDecimal.ZERO)
                        .build())
                .collect(Collectors.toList());

        LocalDate expiryThreshold = LocalDate.now().plusDays(90);
        List<Medicine> expiringItems = allActiveMedicines.stream()
                .filter(medicine -> {
                    LocalDate expiryDate = medicine.getExpiryDate();
                    return medicine.getStockQuantity() > 0 &&
                            expiryDate != null &&
                            expiryDate.isBefore(expiryThreshold);
                })
                .collect(Collectors.toList());

        List<StockSummary.StockItem> expiringItemResponses = expiringItems.stream()
                .map(medicine -> {
                    BigDecimal medicineCostValue = StockCalculator.calculateCostStockValue(medicine);
                    BigDecimal medicineSellingValue = StockCalculator.calculateSellingStockValue(medicine);

                    return StockSummary.StockItem.builder()
                            .medicineId(medicine.getId().toString())
                            .medicineName(medicine.getName())
                            .category(medicine.getCategory())
                            .stockQuantity(medicine.getStockQuantity())
                            .reorderLevel(medicine.getReorderLevel())
                            .costValue(medicineCostValue)
                            .sellingValue(medicineSellingValue)
                            .value(medicineSellingValue)
                            .build();
                })
                .collect(Collectors.toList());

        List<Object[]> categoryData = medicineRepository.countByCategory();
        List<StockSummary.CategoryStock> byCategory = categoryData.stream()
                .map(data -> {
                    String category = (String) data[0];
                    BigDecimal categoryCostValue = BigDecimal.ZERO;
                    BigDecimal categorySellingValue = BigDecimal.ZERO;
                    int categoryQuantity = 0;

                    for (Medicine medicine : allActiveMedicines) {
                        if (category.equals(medicine.getCategory())) {
                            categoryCostValue = categoryCostValue.add(StockCalculator.calculateCostStockValue(medicine));
                            categorySellingValue = categorySellingValue.add(StockCalculator.calculateSellingStockValue(medicine));
                            categoryQuantity += medicine.getStockQuantity();
                        }
                    }

                    return StockSummary.CategoryStock.builder()
                            .category(category)
                            .count(((Long) data[1]).intValue())
                            .quantity(categoryQuantity)
                            .costValue(categoryCostValue)
                            .sellingValue(categorySellingValue)
                            .value(categorySellingValue) // Default to selling value
                            .build();
                })
                .collect(Collectors.toList());

        log.info("Stock Summary: Total Items = {}, Total Quantity = {}, Total Value (Selling) = KSh {}",
                totalItems, totalQuantity != null ? totalQuantity : 0, totalValue);

        return StockSummary.builder()
                .totalItems((int) totalItems)
                .totalQuantity(totalQuantity != null ? totalQuantity.intValue() : 0)
                .totalValue(totalValue) // This is SELLING value for dashboard
                .totalCostValue(calculateCostInventoryValue()) // Add total cost value
                .lowStockItems(lowStockItemResponses)
                .outOfStockItems(outOfStockItemResponses)
                .expiringItems(expiringItemResponses)
                .byCategory(byCategory)
                .build();
    }

    public BigDecimal calculateCostInventoryValue() {
        BigDecimal inventoryValue = BigDecimal.ZERO;
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

        log.info("Calculating cost inventory value for {} medicines", allMedicines.size());

        for (Medicine medicine : allMedicines) {
            if (medicine.getStockQuantity() > 0) {
                // Use COST price calculation for individual medicine
                BigDecimal medicineValue = StockCalculator.calculateCostStockValue(medicine);
                inventoryValue = inventoryValue.add(medicineValue);
            }
        }

        log.info("Total Cost Inventory Value calculated: KSh {}", inventoryValue);
        return inventoryValue;
    }

    public BigDecimal calculateSellingInventoryValue() {
        BigDecimal inventoryValue = BigDecimal.ZERO;
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

        log.info("Calculating selling inventory value for {} medicines", allMedicines.size());

        for (Medicine medicine : allMedicines) {
            if (medicine.getStockQuantity() > 0) {
                // Use SELLING price calculation for dashboard
                BigDecimal medicineValue = StockCalculator.calculateSellingStockValue(medicine);
                inventoryValue = inventoryValue.add(medicineValue);
            }
        }

        log.info("Total Selling Inventory Value calculated: KSh {}", inventoryValue);
        return inventoryValue;
    }

    public BalanceSheet getBalanceSheet(LocalDate asOf) {
        // Use SELLING value for inventory in balance sheet
        BigDecimal inventoryValue = calculateSellingInventoryValue();

        BigDecimal cash = BigDecimal.valueOf(500000);
        BigDecimal inventory = inventoryValue;
        BigDecimal accountsReceivable = BigDecimal.valueOf(150000);
        BigDecimal currentAssetsTotal = cash.add(inventory).add(accountsReceivable);

        BigDecimal equipment = BigDecimal.valueOf(500000);
        BigDecimal furniture = BigDecimal.valueOf(200000);
        BigDecimal fixedAssetsTotal = equipment.add(furniture);

        BigDecimal totalAssets = currentAssetsTotal.add(fixedAssetsTotal);

        BigDecimal accountsPayable = BigDecimal.valueOf(300000);
        BigDecimal taxPayable = BigDecimal.valueOf(50000);
        BigDecimal currentLiabilitiesTotal = accountsPayable.add(taxPayable);

        BigDecimal loans = BigDecimal.valueOf(500000);
        BigDecimal longTermLiabilitiesTotal = loans;

        BigDecimal totalLiabilities = currentLiabilitiesTotal.add(longTermLiabilitiesTotal);

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
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(LocalTime.MAX);

        List<Sale> sales = saleRepository.findSalesByCriteria(
                startDateTime, endDateTime, null, null,
                PageRequest.of(0, Integer.MAX_VALUE)).getContent();

        BigDecimal totalSales = BigDecimal.ZERO;
        BigDecimal totalCostOfGoodsSold = BigDecimal.ZERO;

        for (Sale sale : sales) {
            totalSales = totalSales.add(sale.getTotal() != null ? sale.getTotal() : BigDecimal.ZERO);

            if (sale.getCostOfGoodsSold() != null) {
                totalCostOfGoodsSold = totalCostOfGoodsSold.add(sale.getCostOfGoodsSold());
            } else {
                for (SaleItem item : sale.getItems()) {
                    if (item.getCostOfGoodsSold() != null) {
                        totalCostOfGoodsSold = totalCostOfGoodsSold.add(item.getCostOfGoodsSold());
                    } else if (item.getCostPrice() != null) {
                        BigDecimal itemCost = item.getCostPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
                        totalCostOfGoodsSold = totalCostOfGoodsSold.add(itemCost);
                    }
                }
            }
        }

        BigDecimal otherIncome = BigDecimal.valueOf(10000);
        BigDecimal totalRevenue = totalSales.add(otherIncome);
        BigDecimal grossProfit = totalRevenue.subtract(totalCostOfGoodsSold);

        BigDecimal salaries = BigDecimal.valueOf(200000);
        BigDecimal rent = BigDecimal.valueOf(50000);
        BigDecimal utilities = BigDecimal.valueOf(15000);
        BigDecimal supplies = BigDecimal.valueOf(10000);
        BigDecimal marketing = BigDecimal.valueOf(5000);
        BigDecimal other = BigDecimal.valueOf(5000);
        BigDecimal totalOperatingExpenses = salaries.add(rent).add(utilities)
                .add(supplies).add(marketing).add(other);

        BigDecimal operatingProfit = grossProfit.subtract(totalOperatingExpenses);
        BigDecimal taxes = operatingProfit.multiply(BigDecimal.valueOf(0.15));
        BigDecimal netProfit = operatingProfit.subtract(taxes);

        return IncomeStatement.builder()
                .period(IncomeStatement.DateRange.builder()
                        .start(startDate)
                        .end(endDate)
                        .build())
                .revenue(IncomeStatement.Revenue.builder()
                        .sales(totalSales)
                        .otherIncome(otherIncome)
                        .totalRevenue(totalRevenue)
                        .build())
                .costOfGoodsSold(totalCostOfGoodsSold)
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

    /**
     * Get inventory breakdown showing both cost and selling values
     */
    public Map<String, Object> getInventoryBreakdown() {
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

        BigDecimal totalCostValue = BigDecimal.ZERO;
        BigDecimal totalSellingValue = BigDecimal.ZERO;
        Map<String, Object> categoryBreakdown = new HashMap<>();

        for (Medicine medicine : allMedicines) {
            BigDecimal costValue = StockCalculator.calculateCostStockValue(medicine);
            BigDecimal sellingValue = StockCalculator.calculateSellingStockValue(medicine);

            totalCostValue = totalCostValue.add(costValue);
            totalSellingValue = totalSellingValue.add(sellingValue);

            // Add to category breakdown
            String category = medicine.getCategory() != null ? medicine.getCategory() : "Uncategorized";
            Map<String, Object> categoryData = (Map<String, Object>) categoryBreakdown.getOrDefault(category, new HashMap<>());

            BigDecimal categoryCost = (BigDecimal) categoryData.getOrDefault("costValue", BigDecimal.ZERO);
            BigDecimal categorySelling = (BigDecimal) categoryData.getOrDefault("sellingValue", BigDecimal.ZERO);
            int categoryCount = (int) categoryData.getOrDefault("count", 0);
            int categoryQuantity = (int) categoryData.getOrDefault("quantity", 0);

            categoryCost = categoryCost.add(costValue);
            categorySelling = categorySelling.add(sellingValue);
            categoryCount++;
            categoryQuantity += medicine.getStockQuantity();

            categoryData.put("costValue", categoryCost);
            categoryData.put("sellingValue", categorySelling);
            categoryData.put("count", categoryCount);
            categoryData.put("quantity", categoryQuantity);
            categoryBreakdown.put(category, categoryData);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("totalCostValue", totalCostValue);
        result.put("totalSellingValue", totalSellingValue);
        result.put("totalItems", allMedicines.size());
        result.put("categoryBreakdown", categoryBreakdown);
        result.put("calculatedAt", LocalDateTime.now());

        return result;
    }
}