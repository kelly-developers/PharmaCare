package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.ExpenseRequest;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.dto.response.ExpenseResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;

import com.PharmaCare.pos_backend.enums.ExpenseStatus;
import com.PharmaCare.pos_backend.service.ExpenseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/expenses")
@RequiredArgsConstructor
public class ExpenseController {

    private final ExpenseService expenseService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<ExpenseResponse>>> getAllExpenses(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) ExpenseStatus status) {

        PaginatedResponse<ExpenseResponse> expenses = expenseService.getAllExpenses(
                page, limit, category, startDate, endDate, status);
        return ResponseEntity.ok(ApiResponse.success(expenses));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ExpenseResponse>> getExpenseById(@PathVariable UUID id) {
        ExpenseResponse expense = expenseService.getExpenseById(id);
        return ResponseEntity.ok(ApiResponse.success(expense));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'CASHIER')")
    public ResponseEntity<ApiResponse<ExpenseResponse>> createExpense(
            @Valid @RequestBody ExpenseRequest request) {

        ExpenseResponse expense = expenseService.createExpense(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(expense, "Expense created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'CASHIER')")
    public ResponseEntity<ApiResponse<ExpenseResponse>> updateExpense(
            @PathVariable UUID id,
            @Valid @RequestBody ExpenseRequest request) {

        ExpenseResponse expense = expenseService.updateExpense(id, request);
        return ResponseEntity.ok(ApiResponse.success(expense, "Expense updated successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'CASHIER')")
    public ResponseEntity<ApiResponse<Void>> deleteExpense(@PathVariable UUID id) {
        expenseService.deleteExpense(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Expense deleted successfully"));
    }

    @PatchMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ExpenseResponse>> approveExpense(
            @PathVariable UUID id,
            @RequestParam UUID approvedBy) {

        ExpenseResponse expense = expenseService.approveExpense(id, approvedBy);
        return ResponseEntity.ok(ApiResponse.success(expense, "Expense approved successfully"));
    }

    @PatchMapping("/{id}/reject")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ExpenseResponse>> rejectExpense(
            @PathVariable UUID id,
            @RequestParam UUID rejectedBy,
            @RequestParam String reason) {

        ExpenseResponse expense = expenseService.rejectExpense(id, rejectedBy, reason);
        return ResponseEntity.ok(ApiResponse.success(expense, "Expense rejected successfully"));
    }

    @GetMapping("/pending")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getPendingExpenses() {
        var expenses = expenseService.getPendingExpenses();
        return ResponseEntity.ok(ApiResponse.success(expenses));
    }

    @GetMapping("/category/{category}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getExpensesByCategory(@PathVariable String category) {
        var expenses = expenseService.getExpensesByCategory(category);
        return ResponseEntity.ok(ApiResponse.success(expenses));
    }

    @GetMapping("/period-total")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getExpensesTotalForPeriod(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        var total = expenseService.getTotalExpensesForPeriod(startDate, endDate);

        var result = new Object() {
            public final BigDecimal totalExpenses = total;
            public final LocalDate periodStartDate = startDate;
            public final LocalDate periodEndDate = endDate;
        };

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getExpenseStats() {
        long pendingCount = expenseService.countExpensesByStatus(ExpenseStatus.PENDING);
        long approvedCount = expenseService.countExpensesByStatus(ExpenseStatus.APPROVED);
        long rejectedCount = expenseService.countExpensesByStatus(ExpenseStatus.REJECTED);

        var stats = new Object() {
            public final long pendingExpensesCount = pendingCount;
            public final long approvedExpensesCount = approvedCount;
            public final long rejectedExpensesCount = rejectedCount;
            public final long totalExpensesCount = pendingCount + approvedCount + rejectedCount;
        };

        return ResponseEntity.ok(ApiResponse.success(stats));
    }
}