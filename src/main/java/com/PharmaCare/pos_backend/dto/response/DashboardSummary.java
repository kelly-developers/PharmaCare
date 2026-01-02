package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

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
    private BigDecimal stockValue;
    private int pendingExpenses;
    private int pendingPrescriptions;
    private BigDecimal thisMonthProfit;
    private BigDecimal lastMonthProfit;
    private BigDecimal inventoryValue;
    private int expiringSoonCount;
    // For backward compatibility
    private int outOfStockCount;
    private BigDecimal todayExpenses;


}