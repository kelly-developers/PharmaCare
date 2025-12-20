package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.EmployeeRequest;
import com.PharmaCare.pos_backend.dto.request.PayrollRequest;
import com.PharmaCare.pos_backend.enums.PayrollStatus;

import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.model.dto.response.EmployeeResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.PayrollResponse;

import com.PharmaCare.pos_backend.service.EmployeeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeService employeeService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<EmployeeResponse>>> getAllEmployees(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) Boolean activeOnly) {

        PaginatedResponse<EmployeeResponse> employees = employeeService.getAllEmployees(
                page, limit, search, department, activeOnly);
        return ResponseEntity.ok(ApiResponse.success(employees));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<EmployeeResponse>> getEmployeeById(@PathVariable UUID id) {
        EmployeeResponse employee = employeeService.getEmployeeById(id);
        return ResponseEntity.ok(ApiResponse.success(employee));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<EmployeeResponse>> createEmployee(
            @Valid @RequestBody EmployeeRequest request) {

        EmployeeResponse employee = employeeService.createEmployee(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(employee, "Employee created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<EmployeeResponse>> updateEmployee(
            @PathVariable UUID id,
            @Valid @RequestBody EmployeeRequest request) {

        EmployeeResponse employee = employeeService.updateEmployee(id, request);
        return ResponseEntity.ok(ApiResponse.success(employee, "Employee updated successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> deleteEmployee(@PathVariable UUID id) {
        employeeService.deleteEmployee(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Employee deactivated successfully"));
    }

    @PatchMapping("/{id}/activate")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> activateEmployee(@PathVariable UUID id) {
        employeeService.activateEmployee(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Employee activated successfully"));
    }

    @GetMapping("/user/{userId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<EmployeeResponse>> getEmployeeByUserId(@PathVariable UUID userId) {
        EmployeeResponse employee = employeeService.getEmployeeByUserId(userId);
        return ResponseEntity.ok(ApiResponse.success(employee));
    }

    @GetMapping("/{id}/payroll")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<PayrollResponse>>> getEmployeePayroll(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) PayrollStatus status) {

        PaginatedResponse<PayrollResponse> payroll = employeeService.getEmployeePayroll(
                id, page, limit, month, status);
        return ResponseEntity.ok(ApiResponse.success(payroll));
    }

    @PostMapping("/payroll")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PayrollResponse>> createPayroll(
            @Valid @RequestBody PayrollRequest request) {

        PayrollResponse payroll = employeeService.createPayroll(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(payroll, "Payroll created successfully"));
    }

    @PatchMapping("/payroll/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PayrollResponse>> updatePayrollStatus(
            @PathVariable UUID id,
            @RequestParam PayrollStatus status) {

        PayrollResponse payroll = employeeService.updatePayrollStatus(id, status);
        return ResponseEntity.ok(ApiResponse.success(payroll, "Payroll status updated successfully"));
    }

    @GetMapping("/active")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<EmployeeResponse>>> getActiveEmployees() {
        List<EmployeeResponse> employees = employeeService.getActiveEmployees();
        return ResponseEntity.ok(ApiResponse.success(employees));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getEmployeeStats() {
        long activeCount = employeeService.countActiveEmployees();

        var stats = new Object() {
            public final long activeEmployees = activeCount;
        };

        return ResponseEntity.ok(ApiResponse.success(stats));
    }
}