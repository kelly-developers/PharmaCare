package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StockSummary {
    private int totalItems;
    private int totalQuantity;
    private BigDecimal totalValue; // Selling value (for dashboard)
    private BigDecimal totalCostValue; // Cost value
    private List<StockItem> lowStockItems;
    private List<StockItem> outOfStockItems;
    private List<StockItem> expiringItems;
    private List<CategoryStock> byCategory;

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
        private BigDecimal costValue; // Cost value of stock
        private BigDecimal sellingValue; // Selling value of stock
        private BigDecimal value; // For backward compatibility (selling value)
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryStock {
        private String category;
        private int count;
        private int quantity;
        private BigDecimal costValue; // Cost value for category
        private BigDecimal sellingValue; // Selling value for category
        private BigDecimal value; // For backward compatibility (selling value)
    }
}