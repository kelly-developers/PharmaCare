package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardSummary {
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