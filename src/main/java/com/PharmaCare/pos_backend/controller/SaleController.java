package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.SaleRequest;
import com.PharmaCare.pos_backend.dto.response.DashboardSummary;
import com.PharmaCare.pos_backend.dto.response.SalesSummary;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.SaleResponse;
import com.PharmaCare.pos_backend.enums.PaymentMethod;
import com.PharmaCare.pos_backend.exception.UnauthorizedException;
import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.repository.UserRepository;
import com.PharmaCare.pos_backend.service.SaleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SaleController {

    private final SaleService saleService;
    private final UserRepository userRepository;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<SaleResponse>>> getAllSales(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) UUID cashierId,
            @RequestParam(required = false) PaymentMethod paymentMethod) {

        PaginatedResponse<SaleResponse> sales = saleService.getAllSales(
                page, limit, startDate, endDate, cashierId, paymentMethod);
        return ResponseEntity.ok(ApiResponse.success(sales));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'CASHIER')")
    public ResponseEntity<ApiResponse<SaleResponse>> getSaleById(@PathVariable UUID id) {
        SaleResponse sale = saleService.getSaleById(id);
        return ResponseEntity.ok(ApiResponse.success(sale));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'CASHIER')")
    public ResponseEntity<ApiResponse<SaleResponse>> createSale(
            @Valid @RequestBody SaleRequest request,
            Authentication authentication) {

        // You can optionally validate that the authenticated user matches the cashierId
        String currentUsername = authentication.getName();

        SaleResponse sale = saleService.createSale(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(sale, "Sale created successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteSale(@PathVariable UUID id) {
        saleService.deleteSale(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Sale deleted successfully"));
    }

    @GetMapping("/today")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'CASHIER')")
    public ResponseEntity<ApiResponse<DashboardSummary>> getTodaySales(
            @RequestParam(required = false) UUID cashierId) {

        DashboardSummary summary = saleService.getTodaySalesSummary(cashierId);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/cashier/{cashierId}/today")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'CASHIER')")
    public ResponseEntity<ApiResponse<List<SaleResponse>>> getCashierTodaySales(
            @PathVariable UUID cashierId,
            Authentication authentication) {

        // Verify cashier can only access their own data
        if (authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_CASHIER"))) {
            String currentUsername = authentication.getName();
            User currentUser = userRepository.findByEmail(currentUsername)
                    .orElseThrow(() -> new UnauthorizedException("User not found"));

            // Cashiers can only view their own sales
            if (!currentUser.getId().equals(cashierId)) {
                throw new UnauthorizedException("You can only view your own sales");
            }
        }

        List<SaleResponse> sales = saleService.getCashierTodaySales(cashierId);
        return ResponseEntity.ok(ApiResponse.success(sales));
    }

    @GetMapping("/report")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<SalesSummary>> getSalesReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "day") String groupBy) {

        SalesSummary summary = saleService.getSalesSummary(startDate, endDate, groupBy);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/cashier/{cashierId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<SaleResponse>>> getSalesByCashier(
            @PathVariable UUID cashierId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit) {

        PaginatedResponse<SaleResponse> sales = saleService.getAllSales(
                page, limit, null, null, cashierId, null);
        return ResponseEntity.ok(ApiResponse.success(sales));
    }

    @GetMapping("/period-total")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getSalesTotalForPeriod(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        BigDecimal total = saleService.getTotalSalesForPeriod(startDate, endDate);
        long count = saleService.countSalesForPeriod(startDate, endDate);

        var result = new Object() {
            public final BigDecimal totalSales = total;
            public final long transactionCount = count;
            public final LocalDate periodStartDate = startDate;
            public final LocalDate periodEndDate = endDate;
        };

        return ResponseEntity.ok(ApiResponse.success(result));
    }
}