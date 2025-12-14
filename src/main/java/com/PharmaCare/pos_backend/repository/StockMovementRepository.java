package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.model.entity.Medicine;
import com.PharmaCare.pos_backend.model.entity.StockMovement;
import com.PharmaCare.pos_backend.model.entity.StockMovementType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {
    Page<StockMovement> findByMedicine(Medicine medicine, Pageable pageable);

    @Query("SELECT sm FROM StockMovement sm WHERE " +
            "(:medicineId IS NULL OR sm.medicine.id = :medicineId) AND " +
            "(:type IS NULL OR sm.type = :type) AND " +
            "(:startDate IS NULL OR sm.createdAt >= :startDate) AND " +
            "(:endDate IS NULL OR sm.createdAt <= :endDate) " +
            "ORDER BY sm.createdAt DESC")
    Page<StockMovement> findStockMovements(@Param("medicineId") UUID medicineId,
                                           @Param("type") StockMovementType type,
                                           @Param("startDate") LocalDateTime startDate,
                                           @Param("endDate") LocalDateTime endDate,
                                           Pageable pageable);

    @Query("SELECT sm FROM StockMovement sm WHERE sm.referenceId = :referenceId")
    List<StockMovement> findByReferenceId(@Param("referenceId") UUID referenceId);

    @Query("SELECT SUM(sm.quantity) FROM StockMovement sm WHERE sm.medicine.id = :medicineId " +
            "AND sm.createdAt >= :startDate AND sm.createdAt <= :endDate")
    Integer getNetMovementForPeriod(@Param("medicineId") UUID medicineId,
                                    @Param("startDate") LocalDateTime startDate,
                                    @Param("endDate") LocalDateTime endDate);

    @Query("SELECT sm.type, SUM(sm.quantity) FROM StockMovement sm WHERE " +
            "sm.createdAt >= :startDate AND sm.createdAt <= :endDate " +
            "GROUP BY sm.type")
    List<Object[]> getStockMovementSummary(@Param("startDate") LocalDateTime startDate,
                                           @Param("endDate") LocalDateTime endDate);
}