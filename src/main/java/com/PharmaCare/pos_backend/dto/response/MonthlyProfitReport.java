package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MonthlyProfitReport {
    private YearMonth month;
    private BigDecimal totalSales;
    private BigDecimal totalCost;
    private BigDecimal totalProfit;
    private int totalTransactions;
    private int totalItemsSold;
    private List<DailyProfit> dailyProfits;
}