package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.PurchaseOrderRequest;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.PurchaseOrderResponse;
import com.PharmaCare.pos_backend.enums.PurchaseOrderStatus;
import com.PharmaCare.pos_backend.service.PurchaseOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.UUID;

@RestController
@RequestMapping("/api/purchase-orders")
@RequiredArgsConstructor
public class PurchaseOrderController {

    private final PurchaseOrderService purchaseOrderService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<PurchaseOrderResponse>>> getAllPurchaseOrders(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) PurchaseOrderStatus status,
            @RequestParam(required = false) UUID supplierId) {

        PaginatedResponse<PurchaseOrderResponse> orders = purchaseOrderService.getAllPurchaseOrders(
                page, limit, status, supplierId);
        return ResponseEntity.ok(ApiResponse.success(orders));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> getPurchaseOrderById(@PathVariable UUID id) {
        PurchaseOrderResponse order = purchaseOrderService.getPurchaseOrderById(id);
        return ResponseEntity.ok(ApiResponse.success(order));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> createPurchaseOrder(
            @Valid @RequestBody PurchaseOrderRequest request) {

        PurchaseOrderResponse order = purchaseOrderService.createPurchaseOrder(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(order, "Purchase order created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> updatePurchaseOrder(
            @PathVariable UUID id,
            @Valid @RequestBody PurchaseOrderRequest request) {

        PurchaseOrderResponse order = purchaseOrderService.updatePurchaseOrder(id, request);
        return ResponseEntity.ok(ApiResponse.success(order, "Purchase order updated successfully"));
    }

    @PatchMapping("/{id}/submit")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> submitPurchaseOrder(@PathVariable UUID id) {
        PurchaseOrderResponse order = purchaseOrderService.submitPurchaseOrder(id);
        return ResponseEntity.ok(ApiResponse.success(order, "Purchase order submitted successfully"));
    }

    @PatchMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> approvePurchaseOrder(
            @PathVariable UUID id,
            @RequestParam UUID approvedBy) {

        PurchaseOrderResponse order = purchaseOrderService.approvePurchaseOrder(id, approvedBy);
        return ResponseEntity.ok(ApiResponse.success(order, "Purchase order approved successfully"));
    }

    @PatchMapping("/{id}/receive")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> receivePurchaseOrder(
            @PathVariable UUID id,
            @RequestParam UUID receivedBy) {

        PurchaseOrderResponse order = purchaseOrderService.receivePurchaseOrder(id, receivedBy);
        return ResponseEntity.ok(ApiResponse.success(order, "Purchase order received successfully"));
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PurchaseOrderResponse>> cancelPurchaseOrder(@PathVariable UUID id) {
        PurchaseOrderResponse order = purchaseOrderService.cancelPurchaseOrder(id);
        return ResponseEntity.ok(ApiResponse.success(order, "Purchase order cancelled successfully"));
    }

    @GetMapping("/supplier/{supplierId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getPurchaseOrdersBySupplier(@PathVariable UUID supplierId) {
        var orders = purchaseOrderService.getPurchaseOrdersBySupplier(supplierId);
        return ResponseEntity.ok(ApiResponse.success(orders));
    }

    @GetMapping("/status/{status}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getPurchaseOrdersByStatus(@PathVariable PurchaseOrderStatus status) {
        var orders = purchaseOrderService.getPurchaseOrdersByStatus(status);
        return ResponseEntity.ok(ApiResponse.success(orders));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getPurchaseOrderStats() {
        long draftOrders = purchaseOrderService.countPurchaseOrdersByStatus(PurchaseOrderStatus.DRAFT);
        long pendingOrders = purchaseOrderService.countPurchaseOrdersByStatus(PurchaseOrderStatus.PENDING);
        long approvedOrders = purchaseOrderService.countPurchaseOrdersByStatus(PurchaseOrderStatus.APPROVED);
        long receivedOrders = purchaseOrderService.countPurchaseOrdersByStatus(PurchaseOrderStatus.RECEIVED);
        long cancelledOrders = purchaseOrderService.countPurchaseOrdersByStatus(PurchaseOrderStatus.CANCELLED);

        var stats = new Object() {
            public final long draftCount = draftOrders;
            public final long pendingCount = pendingOrders;
            public final long approvedCount = approvedOrders;
            public final long receivedCount = receivedOrders;
            public final long cancelledCount = cancelledOrders;
            public final long totalCount = draftOrders + pendingOrders + approvedOrders + receivedOrders + cancelledOrders;
        };

        return ResponseEntity.ok(ApiResponse.success(stats));
    }
}