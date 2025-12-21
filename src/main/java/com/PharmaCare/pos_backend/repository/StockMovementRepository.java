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

    // FIXED: Use native query with explicit casting
    @Query(value = """
        SELECT * FROM patientcare.stock_movements sm 
        WHERE (:medicineId IS NULL OR sm.medicine_id = CAST(:medicineId AS uuid)) 
        AND (:type IS NULL OR sm.type = CAST(:type AS text)) 
        AND (:startDate IS NULL OR sm.created_at >= :startDate) 
        AND (:endDate IS NULL OR sm.created_at <= :endDate) 
        ORDER BY sm.created_at DESC
        """,
            countQuery = """
        SELECT COUNT(*) FROM patientcare.stock_movements sm 
        WHERE (:medicineId IS NULL OR sm.medicine_id = CAST(:medicineId AS uuid)) 
        AND (:type IS NULL OR sm.type = CAST(:type AS text)) 
        AND (:startDate IS NULL OR sm.created_at >= :startDate) 
        AND (:endDate IS NULL OR sm.created_at <= :endDate)
        """,
            nativeQuery = true)
    Page<StockMovement> findStockMovementsWithDateTimeNative(
            @Param("medicineId") UUID medicineId,
            @Param("type") String type,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate,
            Pageable pageable
    );

    // Helper method to handle type conversion
    default Page<StockMovement> findStockMovementsWithDateTime(
            UUID medicineId,
            StockMovementType type,
            LocalDateTime startDate,
            LocalDateTime endDate,
            Pageable pageable) {

        String typeStr = type != null ? type.name() : null;
        return findStockMovementsWithDateTimeNative(
                medicineId, typeStr, startDate, endDate, pageable);
    }

    // For LocalDate parameters
    default Page<StockMovement> findStockMovements(
            UUID medicineId,
            StockMovementType type,
            LocalDate startDate,
            LocalDate endDate,
            Pageable pageable) {

        LocalDateTime startDateTime = startDate != null ? startDate.atStartOfDay() : null;
        LocalDateTime endDateTime = endDate != null ? endDate.atTime(23, 59, 59) : null;
        return findStockMovementsWithDateTime(medicineId, type, startDateTime, endDateTime, pageable);
    }

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

    // SIMPLE VERSION: For monthly summary without complex filters
    @Query("""
        SELECT sm FROM StockMovement sm 
        WHERE sm.createdAt >= :startDate 
        AND sm.createdAt <= :endDate 
        ORDER BY sm.createdAt DESC
    """)
    Page<StockMovement> findByDateRange(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate,
            Pageable pageable
    );

    // For monthly summary with LocalDate parameters
    default Page<StockMovement> findByDateRange(LocalDate startDate, LocalDate endDate, Pageable pageable) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(23, 59, 59);
        return findByDateRange(startDateTime, endDateTime, pageable);
    }

    // Count movements by type for a date range
    @Query("""
        SELECT COUNT(sm) FROM StockMovement sm 
        WHERE sm.type = :type 
        AND sm.createdAt >= :startDate 
        AND sm.createdAt <= :endDate
    """)
    long countByTypeAndDateRange(
            @Param("type") StockMovementType type,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    // Sum quantities by type for a date range
    @Query("""
        SELECT COALESCE(SUM(sm.quantity), 0) FROM StockMovement sm 
        WHERE sm.type = :type 
        AND sm.createdAt >= :startDate 
        AND sm.createdAt <= :endDate
    """)
    int sumQuantityByTypeAndDateRange(
            @Param("type") StockMovementType type,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    // SIMPLE method without complex filtering - use this for monthly summary
    @Query("""
        SELECT sm FROM StockMovement sm 
        WHERE sm.createdAt >= :startDate 
        AND sm.createdAt <= :endDate 
        ORDER BY sm.createdAt DESC
    """)
    List<StockMovement> findAllMovementsInPeriod(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );
}