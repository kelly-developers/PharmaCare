package com.PharmaCare.pos_backend.model.dto.response;

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
public class EmployeeResponse {
    private UUID id;
    private UUID userId;
    private String name;
    private String email;
    private String phone;
    private String role;
    private String employeeId;
    private String department;
    private LocalDate hireDate;
    private BigDecimal salary;
    private String bankName;
    private String bankAccount;
    private String nhifNumber;
    private String nssfNumber;
    private String kraPin;
    private boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}