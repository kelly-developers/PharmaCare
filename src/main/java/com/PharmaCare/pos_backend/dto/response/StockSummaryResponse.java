package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StockSummaryResponse {
    private LocalDate startDate;
    private LocalDate endDate;
    private long salesCount;
    private int salesQuantity;
    private long purchasesCount;
    private int purchasesQuantity;
    private long adjustmentsCount;
    private int adjustmentsQuantity;
    private long lossesCount;
    private int lossesQuantity;
    private int netQuantity;

    // Calculated fields
    @Builder.Default
    private double salesGrowthPercentage = 0.0;

    @Builder.Default
    private double purchaseGrowthPercentage = 0.0;

    @Builder.Default
    private double inventoryTurnover = 0.0;
}