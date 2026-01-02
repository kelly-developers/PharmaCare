package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.model.PurchaseOrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PurchaseOrderItemRepository extends JpaRepository<PurchaseOrderItem, UUID> {
    List<PurchaseOrderItem> findByPurchaseOrderId(UUID purchaseOrderId);
    List<PurchaseOrderItem> findByMedicineId(UUID medicineId);

    void deleteByPurchaseOrderId(UUID purchaseOrderId);
}