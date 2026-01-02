package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.model.Medicine;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MedicineRepository extends JpaRepository<Medicine, UUID> {
    Optional<Medicine> findByBatchNumber(String batchNumber);
    boolean existsByBatchNumber(String batchNumber);

    Page<Medicine> findByCategory(String category, Pageable pageable);

    @Query("SELECT m FROM Medicine m WHERE " +
            "(:search IS NULL OR LOWER(m.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(m.genericName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "m.batchNumber LIKE CONCAT('%', :search, '%')) AND " +
            "(:category IS NULL OR m.category = :category) AND " +
            "m.active = true")
    Page<Medicine> searchMedicines(@Param("search") String search,
                                   @Param("category") String category,
                                   Pageable pageable);

    @Query("SELECT m FROM Medicine m WHERE m.stockQuantity <= m.reorderLevel AND m.active = true")
    Page<Medicine> findLowStockItems(Pageable pageable);

    @Query("SELECT m FROM Medicine m WHERE m.expiryDate <= :expiryThreshold AND m.active = true")
    Page<Medicine> findExpiringItems(@Param("expiryThreshold") LocalDate expiryThreshold, Pageable pageable);

    @Query("SELECT DISTINCT m.category FROM Medicine m WHERE m.active = true")
    List<String> findAllCategories();

    long countByActiveTrue();

    @Query("SELECT SUM(m.stockQuantity) FROM Medicine m WHERE m.active = true")
    Long sumStockQuantity();

    @Query("SELECT m.category, COUNT(m) as count FROM Medicine m WHERE m.active = true GROUP BY m.category")
    List<Object[]> countByCategory();

    List<Medicine> findBySupplierIdAndActiveTrue(UUID supplierId);

    Page<Medicine> findByActiveTrue(Pageable pageable);
    List<Medicine> findByActiveTrue();

    /**
     * Update stock quantity directly
     */
    @Modifying
    @Query("UPDATE Medicine m SET m.stockQuantity = :newStock WHERE m.id = :id")
    int updateStock(@Param("id") UUID id, @Param("newStock") int newStock);

    /**
     * Check if stock deduction already processed for reference
     */
    @Query("SELECT COUNT(sm) > 0 FROM StockMovement sm WHERE sm.medicine.id = :medicineId AND sm.referenceId = :referenceId")
    boolean existsByMedicineIdAndReferenceId(@Param("medicineId") UUID medicineId,
                                             @Param("referenceId") UUID referenceId);
    
}
