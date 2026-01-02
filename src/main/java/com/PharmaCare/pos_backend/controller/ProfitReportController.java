package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.response.*;
import com.PharmaCare.pos_backend.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;

@RestController
@RequestMapping("/api/reports/profit")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ProfitReportController {

    private final ReportService reportService;

    @GetMapping("/monthly/{yearMonth}")
    public ResponseEntity<MonthlyProfitReport> getMonthlyProfitReport(
            @PathVariable @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth) {
        MonthlyProfitReport report = reportService.getMonthlyProfitReport(yearMonth);
        return ResponseEntity.ok(report);
    }

    @GetMapping("/daily")
    public ResponseEntity<DailyProfit> getDailyProfit(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        DailyProfit profit = reportService.getDailyProfitDetails(date);
        return ResponseEntity.ok(profit);
    }

    @GetMapping("/range")
    public ResponseEntity<BigDecimal> getProfitForRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        BigDecimal profit = reportService.calculateMonthlyProfit(startDate, endDate);
        return ResponseEntity.ok(profit);
    }

    @GetMapping("/summary")
    public ResponseEntity<ProfitSummary> getProfitSummary() {
        ProfitSummary summary = reportService.getProfitSummary();
        return ResponseEntity.ok(summary);
    }
}