package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.model.Supplier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SupplierRepository extends JpaRepository<Supplier, UUID> {
    Optional<Supplier> findByName(String name);
    boolean existsByName(String name);

    List<Supplier> findByIsActiveTrue();

    @Query("SELECT s FROM Supplier s WHERE " +
            "(:search IS NULL OR LOWER(s.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(s.contactPerson) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(s.email) LIKE LOWER(CONCAT('%', :search, '%'))) AND " +
            "(:activeOnly IS NULL OR s.isActive = :activeOnly)")
    Page<Supplier> searchSuppliers(@Param("search") String search,
                                   @Param("activeOnly") Boolean activeOnly,
                                   Pageable pageable);

    long countByIsActiveTrue();
}