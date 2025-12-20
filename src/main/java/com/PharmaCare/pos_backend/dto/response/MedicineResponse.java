package com.PharmaCare.pos_backend.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
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
@JsonInclude(JsonInclude.Include.NON_NULL)
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

    // FIXED: Use 'active' instead of 'isActive' to avoid Jackson issues
    private boolean active;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Getter for compatibility with existing code
    public boolean getIsActive() {
        return active;
    }

    // Setter for compatibility with existing code
    public void setIsActive(boolean active) {
        this.active = active;
    }

    // Safe toString() to prevent recursion
    @Override
    public String toString() {
        return "MedicineResponse{" +
                "id=" + id +
                ", name='" + name + '\'' +
                ", category='" + category + '\'' +
                ", batchNumber='" + batchNumber + '\'' +
                ", stockQuantity=" + stockQuantity +
                ", active=" + active +
                '}';
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class UnitResponse {
        private String type;
        private int quantity;
        private BigDecimal price;

        // Safe toString()
        @Override
        public String toString() {
            return "UnitResponse{" +
                    "type='" + type + '\'' +
                    ", quantity=" + quantity +
                    ", price=" + price +
                    '}';
        }
    }
}