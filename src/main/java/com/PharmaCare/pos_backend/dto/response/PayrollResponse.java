package com.PharmaCare.pos_backend.dto.response;


import com.PharmaCare.pos_backend.enums.PayrollStatus;
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
public class PayrollResponse {
    private UUID id;
    private UUID employeeId;
    private String employeeName;
    private String employeeIdNumber;
    private String month;
    private BigDecimal basicSalary;
    private BigDecimal allowances;
    private BigDecimal deductions;
    private BigDecimal netSalary;
    private LocalDate paymentDate;
    private String paymentMethod;
    private PayrollStatus status;
    private LocalDateTime createdAt;
}