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
    private BigDecimal totalValue;
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
}