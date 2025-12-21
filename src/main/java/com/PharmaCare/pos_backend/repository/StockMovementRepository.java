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

    // FIXED: Remove native query and use JPQL with COALESCE approach
    @Query("""
        SELECT sm FROM StockMovement sm 
        WHERE (COALESCE(:medicineId, sm.medicine.id) = sm.medicine.id) 
        AND (COALESCE(:type, sm.type) = sm.type) 
        AND (COALESCE(:startDate, '1900-01-01T00:00:00') <= sm.createdAt) 
        AND (COALESCE(:endDate, '9999-12-31T23:59:59') >= sm.createdAt) 
        ORDER BY sm.createdAt DESC
    """)
    Page<StockMovement> findStockMovementsWithFilters(
            @Param("medicineId") UUID medicineId,
            @Param("type") StockMovementType type,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate,
            Pageable pageable
    );

    // For LocalDate parameters
    default Page<StockMovement> findStockMovements(
            UUID medicineId,
            StockMovementType type,
            LocalDate startDate,
            LocalDate endDate,
            Pageable pageable) {

        LocalDateTime startDateTime = startDate != null ? startDate.atStartOfDay() : null;
        LocalDateTime endDateTime = endDate != null ? endDate.atTime(23, 59, 59) : null;
        return findStockMovementsWithFilters(medicineId, type, startDateTime, endDateTime, pageable);
    }

    // FIXED: Update the helper method in StockService to use this method
    default Page<StockMovement> findStockMovementsWithDateTime(
            UUID medicineId,
            StockMovementType type,
            LocalDateTime startDate,
            LocalDateTime endDate,
            Pageable pageable) {

        return findStockMovementsWithFilters(medicineId, type, startDate, endDate, pageable);
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