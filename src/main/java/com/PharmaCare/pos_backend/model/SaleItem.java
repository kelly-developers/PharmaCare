package com.PharmaCare.pos_backend.model;

import com.PharmaCare.pos_backend.enums.UnitType;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "sale_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SaleItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_id", nullable = false)
    private Sale sale;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "medicine_id", nullable = false)
    private Medicine medicine;

    @Column(name = "medicine_id", insertable = false, updatable = false)
    private UUID medicineId;

    @Column(nullable = false)
    private String medicineName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UnitType unitType;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal totalPrice;

    @Column(precision = 10, scale = 2)
    private BigDecimal costPrice; // Store cost price at time of sale

    @Column(precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal costOfGoodsSold = BigDecimal.ZERO; // NEW: Calculated cost for sold quantity

    // Calculate cost of goods sold based on sold quantity
    public BigDecimal calculateCostOfGoodsSold() {
        if (costPrice != null && quantity > 0) {
            return costPrice.multiply(BigDecimal.valueOf(quantity));
        }
        return BigDecimal.ZERO;
    }

    // Calculate profit for this item
    public BigDecimal calculateItemProfit() {
        if (totalPrice != null) {
            BigDecimal cogs = calculateCostOfGoodsSold();
            return totalPrice.subtract(cogs);
        }
        return BigDecimal.ZERO;
    }

    // Custom setter to ensure costOfGoodsSold is calculated
    public void setQuantity(int quantity) {
        this.quantity = quantity;
        this.costOfGoodsSold = calculateCostOfGoodsSold();
    }

    public void setCostPrice(BigDecimal costPrice) {
        this.costPrice = costPrice;
        this.costOfGoodsSold = calculateCostOfGoodsSold();
    }

    // Custom setter to ensure medicineId is set when medicine is set
    public void setMedicine(Medicine medicine) {
        this.medicine = medicine;
        if (medicine != null) {
            this.medicineId = medicine.getId();
        }
    }
}