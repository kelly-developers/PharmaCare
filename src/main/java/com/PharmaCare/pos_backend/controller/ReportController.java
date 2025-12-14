package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.response.*;
import com.PharmaCare.pos_backend.model.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<DashboardSummary>> getDashboardSummary() {
        DashboardSummary summary = reportService.getDashboardSummary();
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/sales-summary")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<SalesSummary>> getSalesSummary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "day") String groupBy) {

        SalesSummary summary = reportService.getSalesSummary(startDate, endDate, groupBy);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/stock-summary")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockSummary>> getStockSummary() {
        StockSummary summary = reportService.getStockSummary();
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/balance-sheet")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<BalanceSheet>> getBalanceSheet(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {

        if (asOf == null) {
            asOf = LocalDate.now();
        }

        BalanceSheet balanceSheet = reportService.getBalanceSheet(asOf);
        return ResponseEntity.ok(ApiResponse.success(balanceSheet));
    }

    @GetMapping("/income-statement")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<IncomeStatement>> getIncomeStatement(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        IncomeStatement incomeStatement = reportService.getIncomeStatement(startDate, endDate);
        return ResponseEntity.ok(ApiResponse.success(incomeStatement));
    }
}