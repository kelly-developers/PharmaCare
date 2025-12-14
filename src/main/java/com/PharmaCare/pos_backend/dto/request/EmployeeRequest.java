package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class EmployeeRequest {

    @NotNull(message = "User ID is required")
    private UUID userId;

    @NotBlank(message = "Employee ID is required")
    private String employeeId;

    private String department;

    private LocalDate hireDate;

    private BigDecimal salary;

    private String bankName;
    private String bankAccount;
    private String nhifNumber;
    private String nssfNumber;
    private String kraPin;
}