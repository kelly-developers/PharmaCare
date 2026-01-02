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
public class ProfitSummary {
    private BigDecimal todayProfit;
    private BigDecimal thisWeekProfit;
    private BigDecimal thisMonthProfit;
    private BigDecimal lastMonthProfit;
    private BigDecimal ytdProfit;
}
