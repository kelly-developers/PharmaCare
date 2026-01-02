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
public class BalanceSheet {
    private LocalDate asOf;
    private Assets assets;
    private Liabilities liabilities;
    private Equity equity;
    private BigDecimal totalLiabilitiesAndEquity;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Assets {
        private CurrentAssets currentAssets;
        private FixedAssets fixedAssets;
        private BigDecimal totalAssets;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CurrentAssets {
        private BigDecimal cash;
        private BigDecimal inventory;
        private BigDecimal accountsReceivable;
        private BigDecimal total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FixedAssets {
        private BigDecimal equipment;
        private BigDecimal furniture;
        private BigDecimal total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Liabilities {
        private CurrentLiabilities currentLiabilities;
        private LongTermLiabilities longTermLiabilities;
        private BigDecimal totalLiabilities;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CurrentLiabilities {
        private BigDecimal accountsPayable;
        private BigDecimal taxPayable;
        private BigDecimal total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LongTermLiabilities {
        private BigDecimal loans;
        private BigDecimal total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Equity {
        private BigDecimal capital;
        private BigDecimal retainedEarnings;
        private BigDecimal totalEquity;
    }
}