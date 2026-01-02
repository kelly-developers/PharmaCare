package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class ExpenseApprovalRequest {

    @NotNull(message = "Approved by user ID is required")
    private UUID approvedBy;
}