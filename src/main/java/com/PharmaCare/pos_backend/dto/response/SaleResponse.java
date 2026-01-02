package com.PharmaCare.pos_backend.dto.response;


import com.PharmaCare.pos_backend.enums.PaymentMethod;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaleResponse {
    private UUID id;
    private List<SaleItemResponse> items;
    private BigDecimal subtotal;
    private BigDecimal discount;
    private BigDecimal tax;
    private BigDecimal total;
    private PaymentMethod paymentMethod;
    private UUID cashierId;
    private String cashierName;
    private String customerName;
    private String customerPhone;
    private LocalDateTime createdAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SaleItemResponse {
        private UUID medicineId;
        private String medicineName;
        private String unitType;
        private int quantity;
        private BigDecimal unitPrice;
        private BigDecimal totalPrice;
        private BigDecimal costPrice;
        private BigDecimal profit;
    }
}