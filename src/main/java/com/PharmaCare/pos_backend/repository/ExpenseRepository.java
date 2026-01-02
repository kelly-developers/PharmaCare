package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.ExpenseStatus;
import com.PharmaCare.pos_backend.model.Expense;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, UUID> {
    Page<Expense> findByStatus(ExpenseStatus status, Pageable pageable);
    Page<Expense> findByCategory(String category, Pageable pageable);


    @Query("""
        SELECT e FROM Expense e 
        WHERE (:startDate IS NULL OR e.date >= :startDate) 
        AND (:endDate IS NULL OR e.date <= :endDate) 
        AND (:category IS NULL OR e.category = :category) 
        AND (:status IS NULL OR e.status = :status)
        ORDER BY e.date DESC
    """)
    Page<Expense> findExpensesByCriteria(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("category") String category,
            @Param("status") ExpenseStatus status,
            Pageable pageable
    );

    @Query("SELECT SUM(e.amount) FROM Expense e WHERE e.status = 'APPROVED' AND " +
            "e.date >= :startDate AND e.date <= :endDate")
    BigDecimal getTotalExpensesForPeriod(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );

    @Query("SELECT e.category, SUM(e.amount) as total FROM Expense e WHERE " +
            "e.status = 'APPROVED' AND e.date >= :startDate AND e.date <= :endDate " +
            "GROUP BY e.category ORDER BY total DESC")
    List<Object[]> getExpensesByCategory(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );

    long countByStatus(ExpenseStatus status);
}