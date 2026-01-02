package com.PharmaCare.pos_backend.dto.response;

import com.PharmaCare.pos_backend.enums.Role;
import com.PharmaCare.pos_backend.enums.StockMovementType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StockMovementResponse {
    private UUID id;
    private UUID medicineId;
    private String medicineName;
    private StockMovementType type;
    private int quantity;
    private int previousStock;
    private int newStock;
    private UUID referenceId;
    private String reason;
    private UUID performedById;  // Changed from performedBy
    private String performedByName;
    private Role performedByRole;
    private LocalDateTime createdAt;
}