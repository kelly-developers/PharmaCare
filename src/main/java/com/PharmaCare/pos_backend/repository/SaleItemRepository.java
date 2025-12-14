package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.model.SaleItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface SaleItemRepository extends JpaRepository<SaleItem, UUID> {
    List<SaleItem> findBySaleId(UUID saleId);

    @Query("SELECT SUM(si.quantity) FROM SaleItem si WHERE si.medicine.id = :medicineId")
    Long getTotalQuantitySold(@Param("medicineId") UUID medicineId);

    @Query("SELECT SUM(si.totalPrice - si.costPrice * si.quantity) FROM SaleItem si WHERE " +
            "si.sale.createdAt >= :startDate AND si.sale.createdAt <= :endDate")
    BigDecimal getTotalProfitForPeriod(@Param("startDate") LocalDateTime startDate,
                                       @Param("endDate") LocalDateTime endDate);

    @Query("SELECT si.medicine.id, SUM(si.quantity) as quantity FROM SaleItem si WHERE " +
            "si.sale.createdAt >= :startDate AND si.sale.createdAt <= :endDate " +
            "GROUP BY si.medicine.id")
    List<Object[]> getMedicineSalesByPeriod(@Param("startDate") LocalDateTime startDate,
                                            @Param("endDate") LocalDateTime endDate);
}