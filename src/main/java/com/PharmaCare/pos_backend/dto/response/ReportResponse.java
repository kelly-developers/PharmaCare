package com.PharmaCare.pos_backend.dto.response;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public class ReportResponse {
    // This is just a container class

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DashboardSummary {
        private BigDecimal todaySales;
        private int todayTransactions;
        private BigDecimal todayProfit;
        private int totalStockItems;
        private int lowStockCount;
        private int expiringCount;
        private int pendingOrders;
        private int pendingExpenses;
        private int pendingPrescriptions;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SalesSummary {
        private BigDecimal totalSales;
        private BigDecimal totalCost;
        private BigDecimal grossProfit;
        private double profitMargin;
        private Map<String, BigDecimal> byPaymentMethod;
        private List<CategorySales> byCategory;
        private List<DailySales> dailyBreakdown;

        @Data
        @Builder
        @NoArgsConstructor
        @AllArgsConstructor
        public static class DailySales {
            private LocalDate date;
            private BigDecimal sales;
            private BigDecimal profit;
            private int transactions;
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategorySales {
        private String category;
        private BigDecimal amount;
        private BigDecimal cost;
        private BigDecimal profit;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StockSummary {
        private int totalItems;
        private int totalQuantity;
        private BigDecimal totalValue;
        private List<StockItem> lowStockItems;
        private List<StockItem> outOfStockItems;
        private List<StockItem> expiringItems;
        private List<CategoryStock> byCategory;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StockItem {
        private String medicineId;
        private String medicineName;
        private String category;
        private int stockQuantity;
        private int reorderLevel;
        private BigDecimal value;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryStock {
        private String category;
        private int count;
        private int quantity;
        private BigDecimal value;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BalanceSheet {
        private LocalDate asOf;
        private Assets assets;
        private Liabilities liabilities;
        private Equity equity;
        private BigDecimal totalLiabilitiesAndEquity;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Assets {
        private CurrentAssets currentAssets;
        private FixedAssets fixedAssets;
        private BigDecimal totalAssets;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CurrentAssets {
        private BigDecimal cash;
        private BigDecimal inventory;
        private BigDecimal accountsReceivable;
        private BigDecimal total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FixedAssets {
        private BigDecimal equipment;
        private BigDecimal furniture;
        private BigDecimal total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Liabilities {
        private CurrentLiabilities currentLiabilities;
        private LongTermLiabilities longTermLiabilities;
        private BigDecimal totalLiabilities;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CurrentLiabilities {
        private BigDecimal accountsPayable;
        private BigDecimal taxPayable;
        private BigDecimal total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LongTermLiabilities {
        private BigDecimal loans;
        private BigDecimal total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Equity {
        private BigDecimal capital;
        private BigDecimal retainedEarnings;
        private BigDecimal totalEquity;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class IncomeStatement {
        private DateRange period;
        private Revenue revenue;
        private BigDecimal costOfGoodsSold;
        private BigDecimal grossProfit;
        private OperatingExpenses operatingExpenses;
        private BigDecimal operatingProfit;
        private BigDecimal taxes;
        private BigDecimal netProfit;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DateRange {
        private LocalDate start;
        private LocalDate end;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Revenue {
        private BigDecimal sales;
        private BigDecimal otherIncome;
        private BigDecimal totalRevenue;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OperatingExpenses {
        private BigDecimal salaries;
        private BigDecimal rent;
        private BigDecimal utilities;
        private BigDecimal supplies;
        private BigDecimal marketing;
        private BigDecimal other;
        private BigDecimal total;
    }
}