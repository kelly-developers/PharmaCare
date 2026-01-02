package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IncomeStatement {
    private DateRange period;
    private Revenue revenue;
    private BigDecimal costOfGoodsSold;
    private BigDecimal grossProfit;
    private OperatingExpenses operatingExpenses;
    private BigDecimal operatingProfit;
    private BigDecimal taxes;
    private BigDecimal netProfit;

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