package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.model.entity.PaymentMethod;
import com.PharmaCare.pos_backend.model.entity.Sale;
import com.PharmaCare.pos_backend.model.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface SaleRepository extends JpaRepository<Sale, UUID> {
    Page<Sale> findByCashier(User cashier, Pageable pageable);

    @Query("SELECT s FROM Sale s WHERE " +
            "(:startDate IS NULL OR s.createdAt >= :startDate) AND " +
            "(:endDate IS NULL OR s.createdAt <= :endDate) AND " +
            "(:cashierId IS NULL OR s.cashier.id = :cashierId) AND " +
            "(:paymentMethod IS NULL OR s.paymentMethod = :paymentMethod)")
    Page<Sale> findSalesByCriteria(@Param("startDate") LocalDateTime startDate,
                                   @Param("endDate") LocalDateTime endDate,
                                   @Param("cashierId") UUID cashierId,
                                   @Param("paymentMethod") PaymentMethod paymentMethod,
                                   Pageable pageable);

    @Query("SELECT s FROM Sale s WHERE DATE(s.createdAt) = :date")
    List<Sale> findByDate(@Param("date") LocalDate date);

    @Query("SELECT s FROM Sale s WHERE DATE(s.createdAt) = :date AND s.cashier.id = :cashierId")
    List<Sale> findByDateAndCashier(@Param("date") LocalDate date, @Param("cashierId") UUID cashierId);

    @Query("SELECT SUM(s.total) FROM Sale s WHERE DATE(s.createdAt) = :date")
    BigDecimal getTotalSalesForDate(@Param("date") LocalDate date);

    @Query("SELECT SUM(s.total) FROM Sale s WHERE DATE(s.createdAt) = :date AND s.cashier.id = :cashierId")
    BigDecimal getTotalSalesForDateAndCashier(@Param("date") LocalDate date, @Param("cashierId") UUID cashierId);

    @Query("SELECT COUNT(s) FROM Sale s WHERE DATE(s.createdAt) = :date")
    long countSalesForDate(@Param("date") LocalDate date);

    @Query("SELECT s.paymentMethod, SUM(s.total) as amount FROM Sale s WHERE " +
            "s.createdAt >= :startDate AND s.createdAt <= :endDate " +
            "GROUP BY s.paymentMethod")
    List<Object[]> getSalesByPaymentMethod(@Param("startDate") LocalDateTime startDate,
                                           @Param("endDate") LocalDateTime endDate);

    @Query("SELECT si.medicineName, SUM(si.quantity) as quantity, SUM(si.totalPrice) as amount " +
            "FROM SaleItem si WHERE si.sale.createdAt >= :startDate AND si.sale.createdAt <= :endDate " +
            "GROUP BY si.medicineName ORDER BY quantity DESC")
    List<Object[]> getTopSellingItems(@Param("startDate") LocalDateTime startDate,
                                      @Param("endDate") LocalDateTime endDate);

    @Query("SELECT FUNCTION('DATE', s.createdAt), SUM(s.total) as dailySales " +
            "FROM Sale s WHERE s.createdAt >= :startDate AND s.createdAt <= :endDate " +
            "GROUP BY FUNCTION('DATE', s.createdAt) ORDER BY FUNCTION('DATE', s.createdAt)")
    List<Object[]> getDailySales(@Param("startDate") LocalDateTime startDate,
                                 @Param("endDate") LocalDateTime endDate);
}