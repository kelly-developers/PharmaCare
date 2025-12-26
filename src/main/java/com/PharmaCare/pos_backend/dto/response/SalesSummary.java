package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SalesSummary {
    private BigDecimal totalSales;
    private BigDecimal totalCost;
    private BigDecimal grossProfit;
    private double profitMargin;
    private int itemsSold; // Add this field
    private Map<String, BigDecimal> byPaymentMethod;
    private List<CategorySales> byCategory;
    private List<DailySales> dailyBreakdown;

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
    public static class DailySales {
        private LocalDate date;
        private BigDecimal sales;
        private BigDecimal profit;
        private int transactions;
    }
}