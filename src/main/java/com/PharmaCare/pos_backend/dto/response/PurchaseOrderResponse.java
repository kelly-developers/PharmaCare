package com.PharmaCare.pos_backend.dto.response;


import com.PharmaCare.pos_backend.enums.PurchaseOrderStatus;
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
public class PurchaseOrderResponse {
    private UUID id;
    private String orderNumber;
    private UUID supplierId;
    private String supplierName;
    private List<PurchaseOrderItemResponse> items;
    private BigDecimal subtotal;
    private BigDecimal tax;
    private BigDecimal total;
    private PurchaseOrderStatus status;
    private String notes;
    private UUID createdBy;
    private String createdByName;
    private UUID approvedBy;
    private LocalDateTime approvedAt;
    private UUID receivedBy;
    private LocalDateTime receivedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PurchaseOrderItemResponse {
        private UUID medicineId;
        private String medicineName;
        private int quantity;
        private BigDecimal unitCost;
        private BigDecimal totalCost;
    }
}