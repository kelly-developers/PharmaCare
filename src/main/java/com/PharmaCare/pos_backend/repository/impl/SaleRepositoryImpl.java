package com.PharmaCare.pos_backend.repository.impl;

import com.PharmaCare.pos_backend.enums.PaymentMethod;
import com.PharmaCare.pos_backend.model.Sale;
import com.PharmaCare.pos_backend.repository.SaleRepositoryCustom;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Repository
public class SaleRepositoryImpl implements SaleRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public Page<Sale> findSalesByCriteria(
            LocalDateTime startDate,
            LocalDateTime endDate,
            UUID cashierId,
            PaymentMethod paymentMethod,
            Pageable pageable
    ) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Sale> query = cb.createQuery(Sale.class);
        Root<Sale> sale = query.from(Sale.class);

        List<Predicate> predicates = new ArrayList<>();

        // Add date range   predicates
        if (startDate != null) {
            predicates.add(cb.greaterThanOrEqualTo(sale.get("createdAt"), startDate));
        }
        if (endDate != null) {
            predicates.add(cb.lessThanOrEqualTo(sale.get("createdAt"), endDate));
        }

        // Add cashier predicate
        if (cashierId != null) {
            predicates.add(cb.equal(sale.get("cashier").get("id"), cashierId));
        }

        // Add payment method predicate
        if (paymentMethod != null) {
            predicates.add(cb.equal(sale.get("paymentMethod"), paymentMethod));
        }

        // Apply all predicates
        if (!predicates.isEmpty()) {
            query.where(cb.and(predicates.toArray(new Predicate[0])));
        }

        // Order by created date descending
        query.orderBy(cb.desc(sale.get("createdAt")));

        // Create the query
        TypedQuery<Sale> typedQuery = entityManager.createQuery(query);

        // Apply pagination
        typedQuery.setFirstResult((int) pageable.getOffset());
        typedQuery.setMaxResults(pageable.getPageSize());

        // Get the results
        List<Sale> resultList = typedQuery.getResultList();

        // Get total count for pagination
        Long total = getTotalCount(startDate, endDate, cashierId, paymentMethod);

        return new PageImpl<>(resultList, pageable, total);
    }

    private Long getTotalCount(
            LocalDateTime startDate,
            LocalDateTime endDate,
            UUID cashierId,
            PaymentMethod paymentMethod
    ) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Long> query = cb.createQuery(Long.class);
        Root<Sale> sale = query.from(Sale.class);

        query.select(cb.count(sale));

        List<Predicate> predicates = new ArrayList<>();

        // Add date range predicates
        if (startDate != null) {
            predicates.add(cb.greaterThanOrEqualTo(sale.get("createdAt"), startDate));
        }
        if (endDate != null) {
            predicates.add(cb.lessThanOrEqualTo(sale.get("createdAt"), endDate));
        }

        // Add cashier predicate
        if (cashierId != null) {
            predicates.add(cb.equal(sale.get("cashier").get("id"), cashierId));
        }

        // Add payment method predicate
        if (paymentMethod != null) {
            predicates.add(cb.equal(sale.get("paymentMethod"), paymentMethod));
        }

        // Apply all predicates
        if (!predicates.isEmpty()) {
            query.where(cb.and(predicates.toArray(new Predicate[0])));
        }

        return entityManager.createQuery(query).getSingleResult();
    }
}