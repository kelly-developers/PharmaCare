package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.PurchaseOrderRequest;
import com.PharmaCare.pos_backend.dto.request.StockAdditionRequest;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.PurchaseOrderResponse;
import com.PharmaCare.pos_backend.enums.PurchaseOrderStatus;
import com.PharmaCare.pos_backend.model.*;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PurchaseOrderService {

    private final PurchaseOrderRepository purchaseOrderRepository;
    private final PurchaseOrderItemRepository purchaseOrderItemRepository;
    private final SupplierRepository supplierRepository;
    private final UserRepository userRepository;
    private final MedicineRepository medicineRepository;
    private final StockService stockService;
    private final ModelMapper modelMapper;

    public PurchaseOrderResponse getPurchaseOrderById(UUID id) {
        PurchaseOrder purchaseOrder = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Purchase Order", "id", id));
        return mapToPurchaseOrderResponse(purchaseOrder);
    }

    public PaginatedResponse<PurchaseOrderResponse> getAllPurchaseOrders(int page, int limit,
                                                                         PurchaseOrderStatus status, UUID supplierId) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());

        Page<PurchaseOrder> ordersPage = purchaseOrderRepository.findPurchaseOrdersByCriteria(
                status, supplierId, null, null, pageable);

        List<PurchaseOrderResponse> orderResponses = ordersPage.getContent()
                .stream()
                .map(this::mapToPurchaseOrderResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(orderResponses, page, limit, ordersPage.getTotalElements());
    }

    @Transactional
    public PurchaseOrderResponse createPurchaseOrder(PurchaseOrderRequest request) {
        // Validate request
        validatePurchaseOrderRequest(request);

        User createdBy = userRepository.findById(request.getCreatedBy())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getCreatedBy()));

        PurchaseOrder purchaseOrder = PurchaseOrder.builder()
                .orderNumber(generateOrderNumber())
                .subtotal(request.getSubtotal())
                .tax(request.getTax() != null ? request.getTax() : BigDecimal.ZERO)
                .total(request.getTotal())
                .status(PurchaseOrderStatus.DRAFT)
                .notes(request.getNotes())
                .createdBy(createdBy)
                .createdByName(createdBy.getName())
                .createdAt(LocalDateTime.now())
                .build();

        // Set supplier if provided
        if (request.getSupplierId() != null) {
            Supplier supplier = supplierRepository.findById(request.getSupplierId())
                    .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", request.getSupplierId()));
            purchaseOrder.setSupplier(supplier);
            purchaseOrder.setSupplierName(supplier.getName());
        } else if (request.getSupplierName() != null && !request.getSupplierName().trim().isEmpty()) {
            purchaseOrder.setSupplierName(request.getSupplierName());
        }

        PurchaseOrder savedOrder = purchaseOrderRepository.save(purchaseOrder);

        // Create and save purchase order items
        List<PurchaseOrderItem> orderItems = createPurchaseOrderItems(request.getItems(), savedOrder);
        purchaseOrderItemRepository.saveAll(orderItems);
        savedOrder.setItems(orderItems);

        // Calculate and update totals if not provided
        if (savedOrder.getTotal() == null || savedOrder.getTotal().compareTo(BigDecimal.ZERO) == 0) {
            recalculateTotals(savedOrder);
        }

        log.info("Purchase order created with ID: {}", savedOrder.getId());
        return mapToPurchaseOrderResponse(savedOrder);
    }

    @Transactional
    public PurchaseOrderResponse updatePurchaseOrder(UUID id, PurchaseOrderRequest request) {
        PurchaseOrder purchaseOrder = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Purchase Order", "id", id));

        // Only allow updates if order is in draft status
        if (purchaseOrder.getStatus() != PurchaseOrderStatus.DRAFT) {
            throw new ApiException("Only draft purchase orders can be updated", HttpStatus.BAD_REQUEST);
        }

        // Validate request
        validatePurchaseOrderRequest(request);

        purchaseOrder.setSubtotal(request.getSubtotal());
        purchaseOrder.setTax(request.getTax() != null ? request.getTax() : BigDecimal.ZERO);
        purchaseOrder.setTotal(request.getTotal());
        purchaseOrder.setNotes(request.getNotes());

        // Update supplier
        updateSupplierForPurchaseOrder(purchaseOrder, request);

        // Update purchase order items
        updatePurchaseOrderItems(purchaseOrder, request.getItems());

        // Recalculate totals
        recalculateTotals(purchaseOrder);

        PurchaseOrder updatedOrder = purchaseOrderRepository.save(purchaseOrder);
        log.info("Purchase order updated with ID: {}", id);

        return mapToPurchaseOrderResponse(updatedOrder);
    }

    @Transactional
    public PurchaseOrderResponse approvePurchaseOrder(UUID id, UUID approvedById) {
        PurchaseOrder purchaseOrder = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Purchase Order", "id", id));

        User approvedBy = userRepository.findById(approvedById)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", approvedById));

        // Only allow approval if order is pending
        if (purchaseOrder.getStatus() != PurchaseOrderStatus.PENDING) {
            throw new ApiException("Only pending purchase orders can be approved", HttpStatus.BAD_REQUEST);
        }

        purchaseOrder.setStatus(PurchaseOrderStatus.APPROVED);
        purchaseOrder.setApprovedBy(approvedBy);
        purchaseOrder.setApprovedAt(LocalDateTime.now());

        PurchaseOrder updatedOrder = purchaseOrderRepository.save(purchaseOrder);
        log.info("Purchase order approved with ID: {}", id);

        return mapToPurchaseOrderResponse(updatedOrder);
    }

    @Transactional
    public PurchaseOrderResponse receivePurchaseOrder(UUID id, UUID receivedById) {
        PurchaseOrder purchaseOrder = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Purchase Order", "id", id));

        User receivedBy = userRepository.findById(receivedById)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", receivedById));

        // Only allow receiving if order is approved
        if (purchaseOrder.getStatus() != PurchaseOrderStatus.APPROVED) {
            throw new ApiException("Only approved purchase orders can be received", HttpStatus.BAD_REQUEST);
        }

        // Add stock for each item
        addStockForReceivedItems(purchaseOrder, receivedById, receivedBy);

        purchaseOrder.setStatus(PurchaseOrderStatus.RECEIVED);
        purchaseOrder.setReceivedBy(receivedBy);
        purchaseOrder.setReceivedAt(LocalDateTime.now());

        PurchaseOrder updatedOrder = purchaseOrderRepository.save(purchaseOrder);
        log.info("Purchase order received with ID: {}", id);

        return mapToPurchaseOrderResponse(updatedOrder);
    }

    @Transactional
    public PurchaseOrderResponse cancelPurchaseOrder(UUID id) {
        PurchaseOrder purchaseOrder = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Purchase Order", "id", id));

        // Only allow cancellation if order is not received
        if (purchaseOrder.getStatus() == PurchaseOrderStatus.RECEIVED) {
            throw new ApiException("Received purchase orders cannot be cancelled", HttpStatus.BAD_REQUEST);
        }

        purchaseOrder.setStatus(PurchaseOrderStatus.CANCELLED);

        PurchaseOrder updatedOrder = purchaseOrderRepository.save(purchaseOrder);
        log.info("Purchase order cancelled with ID: {}", id);

        return mapToPurchaseOrderResponse(updatedOrder);
    }

    @Transactional
    public PurchaseOrderResponse submitPurchaseOrder(UUID id) {
        PurchaseOrder purchaseOrder = purchaseOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Purchase Order", "id", id));

        // Only allow submission if order is in draft status
        if (purchaseOrder.getStatus() != PurchaseOrderStatus.DRAFT) {
            throw new ApiException("Only draft purchase orders can be submitted", HttpStatus.BAD_REQUEST);
        }

        // Validate order can be submitted
        validateOrderForSubmission(purchaseOrder);

        purchaseOrder.setStatus(PurchaseOrderStatus.PENDING);

        PurchaseOrder updatedOrder = purchaseOrderRepository.save(purchaseOrder);
        log.info("Purchase order submitted with ID: {}", id);

        return mapToPurchaseOrderResponse(updatedOrder);
    }

    public List<PurchaseOrderResponse> getPurchaseOrdersBySupplier(UUID supplierId) {
        Page<PurchaseOrder> ordersPage = purchaseOrderRepository.findBySupplierId(
                supplierId, PageRequest.of(0, 100, Sort.by("createdAt").descending()));

        return ordersPage.getContent()
                .stream()
                .map(this::mapToPurchaseOrderResponse)
                .collect(Collectors.toList());
    }

    public List<PurchaseOrderResponse> getPurchaseOrdersByStatus(PurchaseOrderStatus status) {
        Page<PurchaseOrder> ordersPage = purchaseOrderRepository.findByStatus(
                status, PageRequest.of(0, 100, Sort.by("createdAt").descending()));

        return ordersPage.getContent()
                .stream()
                .map(this::mapToPurchaseOrderResponse)
                .collect(Collectors.toList());
    }

    public long countPurchaseOrdersByStatus(PurchaseOrderStatus status) {
        return purchaseOrderRepository.countByStatus(status);
    }

    // Helper Methods

    private void validatePurchaseOrderRequest(PurchaseOrderRequest request) {
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new ApiException("Purchase order must have at least one item", HttpStatus.BAD_REQUEST);
        }

        if (request.getCreatedBy() == null) {
            throw new ApiException("Created by user ID is required", HttpStatus.BAD_REQUEST);
        }

        // Validate totals match
        if (request.getSubtotal() != null && request.getTotal() != null) {
            BigDecimal calculatedTotal = request.getSubtotal()
                    .add(request.getTax() != null ? request.getTax() : BigDecimal.ZERO);

            if (calculatedTotal.compareTo(request.getTotal()) != 0) {
                throw new ApiException("Total amount does not match subtotal + tax", HttpStatus.BAD_REQUEST);
            }
        }
    }

    private void validateOrderForSubmission(PurchaseOrder purchaseOrder) {
        if (purchaseOrder.getItems() == null || purchaseOrder.getItems().isEmpty()) {
            throw new ApiException("Cannot submit an empty purchase order", HttpStatus.BAD_REQUEST);
        }

        if (purchaseOrder.getSupplier() == null &&
                (purchaseOrder.getSupplierName() == null || purchaseOrder.getSupplierName().trim().isEmpty())) {
            throw new ApiException("Supplier information is required to submit order", HttpStatus.BAD_REQUEST);
        }
    }

    private List<PurchaseOrderItem> createPurchaseOrderItems(
            List<PurchaseOrderRequest.PurchaseOrderItemRequest> itemRequests,
            PurchaseOrder purchaseOrder) {

        List<PurchaseOrderItem> orderItems = new ArrayList<>();

        for (PurchaseOrderRequest.PurchaseOrderItemRequest itemRequest : itemRequests) {
            PurchaseOrderItem item = PurchaseOrderItem.builder()
                    .purchaseOrder(purchaseOrder)
                    .medicineName(itemRequest.getMedicineName())
                    .quantity(itemRequest.getQuantity())
                    .unitCost(itemRequest.getUnitCost())
                    .totalCost(itemRequest.getTotalCost())
                    .build();

            // Set medicine if provided
            if (itemRequest.getMedicineId() != null) {
                Medicine medicine = medicineRepository.findById(itemRequest.getMedicineId())
                        .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", itemRequest.getMedicineId()));
                item.setMedicine(medicine);
            }

            orderItems.add(item);
        }

        return orderItems;
    }

    private void updatePurchaseOrderItems(PurchaseOrder purchaseOrder,
                                          List<PurchaseOrderRequest.PurchaseOrderItemRequest> itemRequests) {
        // Delete existing items
        purchaseOrderItemRepository.deleteByPurchaseOrderId(purchaseOrder.getId());

        // Create and save new items
        List<PurchaseOrderItem> orderItems = createPurchaseOrderItems(itemRequests, purchaseOrder);
        purchaseOrderItemRepository.saveAll(orderItems);
        purchaseOrder.setItems(orderItems);
    }

    private void updateSupplierForPurchaseOrder(PurchaseOrder purchaseOrder, PurchaseOrderRequest request) {
        if (request.getSupplierId() != null) {
            Supplier supplier = supplierRepository.findById(request.getSupplierId())
                    .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", request.getSupplierId()));
            purchaseOrder.setSupplier(supplier);
            purchaseOrder.setSupplierName(supplier.getName());
        } else if (request.getSupplierName() != null && !request.getSupplierName().trim().isEmpty()) {
            purchaseOrder.setSupplierName(request.getSupplierName());
            purchaseOrder.setSupplier(null);
        } else {
            purchaseOrder.setSupplier(null);
            purchaseOrder.setSupplierName(null);
        }
    }

    private void addStockForReceivedItems(PurchaseOrder purchaseOrder, UUID receivedById, User receivedBy) {
        for (PurchaseOrderItem item : purchaseOrder.getItems()) {
            if (item.getMedicine() != null) {
                // Create StockAdditionRequest - converting UUIDs to Strings
                StockAdditionRequest additionRequest = new StockAdditionRequest(
                        item.getMedicine().getId(),
                        item.getQuantity(),
                        purchaseOrder.getId().toString(),  // Convert UUID to String
                        receivedById.toString(),          // Convert UUID to String
                        receivedBy.getRole().name()
                );

                // Add stock
                stockService.addStock(item.getMedicine().getId(), additionRequest);
            } else {
                log.warn("Item without medicine found in purchase order {}: {}",
                        purchaseOrder.getId(), item.getMedicineName());
            }
        }
    }

    private void recalculateTotals(PurchaseOrder purchaseOrder) {
        if (purchaseOrder.getItems() == null) {
            return;
        }

        BigDecimal subtotal = BigDecimal.ZERO;

        for (PurchaseOrderItem item : purchaseOrder.getItems()) {
            if (item.getTotalCost() != null) {
                subtotal = subtotal.add(item.getTotalCost());
            } else if (item.getUnitCost() != null && item.getQuantity() > 0) {
                BigDecimal itemTotal = item.getUnitCost().multiply(BigDecimal.valueOf(item.getQuantity()));
                item.setTotalCost(itemTotal);
                subtotal = subtotal.add(itemTotal);
            }
        }

        purchaseOrder.setSubtotal(subtotal);

        BigDecimal tax = purchaseOrder.getTax() != null ? purchaseOrder.getTax() : BigDecimal.ZERO;
        BigDecimal total = subtotal.add(tax);
        purchaseOrder.setTotal(total);
    }

    private String generateOrderNumber() {
        // Simple order number generation - you might want to implement a more robust solution
        return "PO-" + LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
    }

    private PurchaseOrderResponse mapToPurchaseOrderResponse(PurchaseOrder purchaseOrder) {
        PurchaseOrderResponse response = modelMapper.map(purchaseOrder, PurchaseOrderResponse.class);

        // Set IDs from related entities
        if (purchaseOrder.getSupplier() != null) {
            response.setSupplierId(purchaseOrder.getSupplier().getId());
        }

        if (purchaseOrder.getCreatedBy() != null) {
            response.setCreatedBy(purchaseOrder.getCreatedBy().getId());
        }

        if (purchaseOrder.getApprovedBy() != null) {
            response.setApprovedBy(purchaseOrder.getApprovedBy().getId());
        }

        if (purchaseOrder.getReceivedBy() != null) {
            response.setReceivedBy(purchaseOrder.getReceivedBy().getId());
        }

        // Map purchase order items
        List<PurchaseOrderResponse.PurchaseOrderItemResponse> itemResponses = purchaseOrder.getItems().stream()
                .map(item -> {
                    PurchaseOrderResponse.PurchaseOrderItemResponse itemResponse =
                            new PurchaseOrderResponse.PurchaseOrderItemResponse();
                    itemResponse.setMedicineId(item.getMedicine() != null ? item.getMedicine().getId() : null);
                    itemResponse.setMedicineName(item.getMedicineName());
                    itemResponse.setQuantity(item.getQuantity());
                    itemResponse.setUnitCost(item.getUnitCost());
                    itemResponse.setTotalCost(item.getTotalCost());
                    return itemResponse;
                })
                .collect(Collectors.toList());
        response.setItems(itemResponses);

        return response;
    }
}