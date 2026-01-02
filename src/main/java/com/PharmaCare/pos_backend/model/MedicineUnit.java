package com.PharmaCare.pos_backend.model;

import com.PharmaCare.pos_backend.enums.UnitType;
import com.PharmaCare.pos_backend.enums.converter.UnitTypeConverter;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "medicine_units")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MedicineUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "medicine_id", nullable = false)
    private Medicine medicine;

    @Convert(converter = UnitTypeConverter.class)
    @Column(name = "type", nullable = false, length = 50)
    private UnitType type;

    @Column(name = "quantity", nullable = false)
    private Integer quantity = 1;

    @Column(name = "price", precision = 19, scale = 2, nullable = false)
    private BigDecimal price;

    @Override
    public String toString() {
        return "MedicineUnit{" +
                "id=" + id +
                ", type=" + (type != null ? type.name() : "null") +
                ", quantity=" + quantity +
                ", price=" + price +
                '}';
    }
}