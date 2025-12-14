package com.PharmaCare.pos_backend.dto.response;


import com.PharmaCare.pos_backend.enums.ExpenseStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExpenseResponse {
    private UUID id;
    private String title;
    private String description;
    private BigDecimal amount;
    private String category;
    private ExpenseStatus status;
    private LocalDate date;
    private String receiptUrl;
    private UUID approvedBy;
    private String approvedByName;
    private UUID rejectedBy;
    private String rejectionReason;
    private UUID createdBy;
    private String createdByName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}