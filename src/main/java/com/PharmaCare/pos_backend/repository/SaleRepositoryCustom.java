package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.PaymentMethod;
import com.PharmaCare.pos_backend.model.Sale;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.UUID;

public interface SaleRepositoryCustom {
    Page<Sale> findSalesByCriteria(
            LocalDateTime startDate,
            LocalDateTime endDate,
            UUID cashierId,
            PaymentMethod paymentMethod,
            Pageable pageable
    );
}