package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.StockMovementType;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.model.StockMovement;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    Page<StockMovement> findByMedicine(Medicine medicine, Pageable pageable);

    // FIXED: Single method with proper null handling
    @Query("""
        SELECT sm FROM StockMovement sm 
        WHERE (:medicineId IS NULL OR sm.medicine.id = :medicineId) 
        AND (:type IS NULL OR sm.type = :type) 
        AND (:startDate IS NULL OR CAST(sm.createdAt AS date) >= :startDate) 
        AND (:endDate IS NULL OR CAST(sm.createdAt AS date) <= :endDate) 
        ORDER BY sm.createdAt DESC
    """)
    Page<StockMovement> findStockMovements(
            @Param("medicineId") UUID medicineId,
            @Param("type") StockMovementType type,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            Pageable pageable
    );

    @Query("SELECT sm FROM StockMovement sm WHERE sm.referenceId = :referenceId")
    List<StockMovement> findByReferenceId(@Param("referenceId") UUID referenceId);

    @Query("SELECT SUM(sm.quantity) FROM StockMovement sm WHERE sm.medicine.id = :medicineId " +
            "AND sm.createdAt >= :startDate AND sm.createdAt <= :endDate")
    Integer getNetMovementForPeriod(
            @Param("medicineId") UUID medicineId,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    @Query("SELECT sm.type, SUM(sm.quantity) FROM StockMovement sm WHERE " +
            "sm.createdAt >= :startDate AND sm.createdAt <= :endDate " +
            "GROUP BY sm.type")
    List<Object[]> getStockMovementSummary(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    // Additional helper method for monthly summary
    @Query("SELECT sm FROM StockMovement sm WHERE " +
            "CAST(sm.createdAt AS date) >= :startDate AND CAST(sm.createdAt AS date) <= :endDate " +
            "ORDER BY sm.createdAt DESC")
    Page<StockMovement> findByDateRange(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            Pageable pageable
    );

    // Count movements by type for a date range
    @Query("SELECT COUNT(sm) FROM StockMovement sm WHERE " +
            "sm.type = :type AND " +
            "CAST(sm.createdAt AS date) >= :startDate AND CAST(sm.createdAt AS date) <= :endDate")
    long countByTypeAndDateRange(
            @Param("type") StockMovementType type,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );

    // Sum quantities by type for a date range
    @Query("SELECT COALESCE(SUM(sm.quantity), 0) FROM StockMovement sm WHERE " +
            "sm.type = :type AND " +
            "CAST(sm.createdAt AS date) >= :startDate AND CAST(sm.createdAt AS date) <= :endDate")
    int sumQuantityByTypeAndDateRange(
            @Param("type") StockMovementType type,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );
}