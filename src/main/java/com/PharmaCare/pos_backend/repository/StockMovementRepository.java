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

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    Page<StockMovement> findByMedicine(Medicine medicine, Pageable pageable);

    /**
     * FIXED: Native query with proper parameter type handling
     * Using explicit CAST only when parameter is not NULL
     */
    @Query(value = """
    SELECT sm.* FROM spotmedpharmacare.stock_movements sm 
    WHERE (:medicineIdStr IS NULL OR sm.medicine_id = CAST(:medicineIdStr AS UUID))
    AND (:type IS NULL OR sm.type = :type)
    AND (:startDate IS NULL OR sm.created_at >= :startDate)
    AND (:endDate IS NULL OR sm.created_at <= :endDate)
    ORDER BY sm.created_at DESC
""", nativeQuery = true)
    List<StockMovement> findStockMovementsNative(
            @Param("medicineIdStr") String medicineIdStr,
            @Param("type") String type,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    /**
     * FIXED: Count query with proper parameter type handling
     */
    @Query(value = """
    SELECT COUNT(sm.*) FROM spotmedpharmacare.stock_movements sm 
    WHERE (:medicineIdStr IS NULL OR sm.medicine_id = CAST(:medicineIdStr AS UUID))
    AND (:type IS NULL OR sm.type = :type)
    AND (:startDate IS NULL OR sm.created_at >= :startDate)
    AND (:endDate IS NULL OR sm.created_at <= :endDate)
""", nativeQuery = true)
    long countStockMovementsNative(
            @Param("medicineIdStr") String medicineIdStr,
            @Param("type") String type,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    /**
     * Fixed JPQL query for paginated results
     */
    @Query(value = """
        SELECT * FROM spotmedpharmacare.stock_movements sm 
        WHERE (:medicineIdStr IS NULL OR sm.medicine_id = CAST(:medicineIdStr AS UUID))
        AND (:type IS NULL OR sm.type = :type)
        AND (:startDate IS NULL OR sm.created_at >= :startDate)
        AND (:endDate IS NULL OR sm.created_at <= :endDate)
        ORDER BY sm.created_at DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    """, nativeQuery = true)
    List<StockMovement> findStockMovementsWithFiltersNativePaginated(
            @Param("medicineIdStr") String medicineIdStr,
            @Param("type") String type,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate,
            @Param("offset") int offset,
            @Param("limit") int limit
    );

    @Query("SELECT sm FROM StockMovement sm WHERE sm.referenceId = :referenceId")
    List<StockMovement> findByReferenceId(@Param("referenceId") UUID referenceId);

    @Query("SELECT COALESCE(SUM(sm.quantity), 0) FROM StockMovement sm WHERE sm.medicine.id = :medicineId " +
            "AND sm.createdAt >= :startDate AND sm.createdAt <= :endDate")
    Integer getNetMovementForPeriod(
            @Param("medicineId") UUID medicineId,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    /**
     * Simplified method for date range queries
     */
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

    /**
     * Statistics queries for monthly summary
     */
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

    /**
     * Find by medicine with optional filters
     */
    @Query("""
        SELECT sm FROM StockMovement sm 
        WHERE sm.medicine.id = :medicineId
        AND (:type IS NULL OR sm.type = :type)
        AND (:startDate IS NULL OR sm.createdAt >= :startDate)
        AND (:endDate IS NULL OR sm.createdAt <= :endDate)
        ORDER BY sm.createdAt DESC
    """)
    Page<StockMovement> findByMedicineWithFilters(
            @Param("medicineId") UUID medicineId,
            @Param("type") StockMovementType type,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate,
            Pageable pageable
    );

    /**
     * Find latest stock movement for a medicine
     */
    Optional<StockMovement> findTopByMedicineIdOrderByCreatedAtDesc(UUID medicineId);

    /**
     * Get stock movements for a specific medicine
     */
    Page<StockMovement> findByMedicineIdOrderByCreatedAtDesc(UUID medicineId, Pageable pageable);

    /**
     * Count total stock movements for a medicine
     */
    long countByMedicineId(UUID medicineId);

    /**
     * Check if transaction already exists to prevent duplicates
     */
    boolean existsByReferenceId(UUID referenceId);

    /**
     * Get stock movements by type
     */
    List<StockMovement> findByTypeOrderByCreatedAtDesc(StockMovementType type);

    /**
     * Get stock movements by medicine and type
     */
    List<StockMovement> findByMedicineIdAndTypeOrderByCreatedAtDesc(UUID medicineId, StockMovementType type);
}