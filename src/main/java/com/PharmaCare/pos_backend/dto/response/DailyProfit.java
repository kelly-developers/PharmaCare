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
public class DailyProfit {
    private LocalDate date;
    private BigDecimal sales;
    private BigDecimal cost; // This is Cost of Goods Sold
    private BigDecimal profit;
    private int transactions;
    private int itemsSold;
}