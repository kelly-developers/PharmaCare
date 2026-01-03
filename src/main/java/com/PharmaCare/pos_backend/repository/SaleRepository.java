package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.PaymentMethod;
import com.PharmaCare.pos_backend.model.Sale;
import com.PharmaCare.pos_backend.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SaleRepository extends JpaRepository<Sale, UUID> {
    Page<Sale> findByCashier(User cashier, Pageable pageable);

    // NEW: Check if transaction already exists
    boolean existsByTransactionId(String transactionId);

    // NEW: Find sale by transaction ID
    Optional<Sale> findByTransactionId(String transactionId);

    @Query("SELECT s FROM Sale s WHERE s.createdAt >= :startOfDay AND s.createdAt <= :endOfDay")
    List<Sale> findByDate(
            @Param("startOfDay") LocalDateTime startOfDay,
            @Param("endOfDay") LocalDateTime endOfDay
    );

    @Query("SELECT s FROM Sale s WHERE s.createdAt >= :startOfDay AND s.createdAt <= :endOfDay AND s.cashier.id = :cashierId")
    List<Sale> findByDateAndCashier(
            @Param("startOfDay") LocalDateTime startOfDay,
            @Param("endOfDay") LocalDateTime endOfDay,
            @Param("cashierId") UUID cashierId
    );

    @Query("SELECT SUM(s.total) FROM Sale s WHERE s.createdAt >= :startOfDay AND s.createdAt <= :endOfDay")
    BigDecimal getTotalSalesForDate(
            @Param("startOfDay") LocalDateTime startOfDay,
            @Param("endOfDay") LocalDateTime endOfDay
    );

    @Query("SELECT SUM(s.total) FROM Sale s WHERE s.createdAt >= :startOfDay AND s.createdAt <= :endOfDay AND s.cashier.id = :cashierId")
    BigDecimal getTotalSalesForDateAndCashier(
            @Param("startOfDay") LocalDateTime startOfDay,
            @Param("endOfDay") LocalDateTime endOfDay,
            @Param("cashierId") UUID cashierId
    );

    @Query("SELECT COUNT(s) FROM Sale s WHERE s.createdAt >= :startOfDay AND s.createdAt <= :endOfDay")
    long countSalesForDate(
            @Param("startOfDay") LocalDateTime startOfDay,
            @Param("endOfDay") LocalDateTime endOfDay
    );

    @Query("SELECT s.paymentMethod, SUM(s.total) as amount FROM Sale s WHERE " +
            "s.createdAt >= :startDate AND s.createdAt <= :endDate " +
            "GROUP BY s.paymentMethod")
    List<Object[]> getSalesByPaymentMethod(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    @Query("SELECT si.medicineName, SUM(si.quantity) as quantity, SUM(si.totalPrice) as amount " +
            "FROM SaleItem si WHERE si.sale.createdAt >= :startDate AND si.sale.createdAt <= :endDate " +
            "GROUP BY si.medicineName ORDER BY quantity DESC")
    List<Object[]> getTopSellingItems(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    @Query(value = """
        SELECT DATE(s.created_at), SUM(s.total) as dailySales 
        FROM spotmedpharmacare.sales s 
        WHERE s.created_at >= :startDate AND s.created_at <= :endDate 
        GROUP BY DATE(s.created_at) 
        ORDER BY DATE(s.created_at)
        """, nativeQuery = true)
    List<Object[]> getDailySales(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    // NEW: Advanced search with filters
    @Query("SELECT s FROM Sale s WHERE " +
            "(:startDate IS NULL OR s.createdAt >= :startDate) AND " +
            "(:endDate IS NULL OR s.createdAt <= :endDate) AND " +
            "(:cashierId IS NULL OR s.cashier.id = :cashierId) AND " +
            "(:paymentMethod IS NULL OR s.paymentMethod = :paymentMethod) " +
            "ORDER BY s.createdAt DESC")
    Page<Sale> findSalesByCriteria(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate,
            @Param("cashierId") UUID cashierId,
            @Param("paymentMethod") PaymentMethod paymentMethod,
            Pageable pageable
    );
}