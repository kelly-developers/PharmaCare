package com.PharmaCare.pos_backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MedicineResponse {
    private UUID id;
    private String name;
    private String genericName;
    private String category;
    private String manufacturer;
    private String batchNumber;
    private LocalDate expiryDate;
    private List<UnitResponse> units;
    private int stockQuantity;
    private int reorderLevel;
    private UUID supplierId;
    private String supplierName;
    private BigDecimal costPrice;
    private String imageUrl;
    private boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UnitResponse {
        private String type;
        private int quantity;
        private BigDecimal price;
    }
}