package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.PurchaseOrderStatus;
import com.PharmaCare.pos_backend.model.PurchaseOrder;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, UUID> {
    Optional<PurchaseOrder> findByOrderNumber(String orderNumber);

    Page<PurchaseOrder> findByStatus(PurchaseOrderStatus status, Pageable pageable);
    Page<PurchaseOrder> findBySupplierId(UUID supplierId, Pageable pageable);

    @Query("SELECT po FROM PurchaseOrder po WHERE " +
            "(:status IS NULL OR po.status = :status) AND " +
            "(:supplierId IS NULL OR po.supplier.id = :supplierId) AND " +
            "(:startDate IS NULL OR po.createdAt >= :startDate) AND " +
            "(:endDate IS NULL OR po.createdAt <= :endDate)")
    Page<PurchaseOrder> findPurchaseOrdersByCriteria(@Param("status") PurchaseOrderStatus status,
                                                     @Param("supplierId") UUID supplierId,
                                                     @Param("startDate") LocalDateTime startDate,
                                                     @Param("endDate") LocalDateTime endDate,
                                                     Pageable pageable);

    @Query("SELECT SUM(po.total) FROM PurchaseOrder po WHERE po.status = 'RECEIVED' AND " +
            "po.createdAt >= :startDate AND po.createdAt <= :endDate")
    BigDecimal getTotalPurchasesForPeriod(@Param("startDate") LocalDateTime startDate,
                                          @Param("endDate") LocalDateTime endDate);

    long countByStatus(PurchaseOrderStatus status);
}