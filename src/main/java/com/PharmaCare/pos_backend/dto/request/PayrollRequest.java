package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class PayrollRequest {

    @NotNull(message = "Employee ID is required")
    private String employeeId;

    @NotBlank(message = "Month is required")
    @Pattern(regexp = "^\\d{4}-(0[1-9]|1[0-2])$", message = "Month must be in YYYY-MM format")
    private String month;

    @NotNull(message = "Basic salary is required")
    private BigDecimal basicSalary;

    private BigDecimal allowances;
    private BigDecimal deductions;

    @NotNull(message = "Net salary is required")
    private BigDecimal netSalary;

    private LocalDate paymentDate;
    private String paymentMethod;
}