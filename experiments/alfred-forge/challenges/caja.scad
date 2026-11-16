// Caja de 80 x 50 x 30 mm con tapa deslizante independiente.
// Unidades: mm. PLA, boquilla 0.4 mm. Imprimir tal como aparece.
$fn = 64;

largo = 80;
ancho = 50;
alto = 30;
pared = 2;
fondo = 2;
clearance = 0.4;             // Separacion normal entre superficies
chaflan_entrada = 0.4;
longitud_entrada = 0.6;

z_tapa = 27.6;
espesor_tapa = alto-z_tapa;
z_apoyo = z_tapa-clearance;
plano_guia = 24.6;          // Cara inclinada: z-y = plano_guia
saliente_guia = alto-plano_guia;
borde_tapa = z_tapa-plano_guia+clearance*sqrt(2);
x_inicio = clearance;
x_fin = largo-pared-clearance;
lamina = 0.02;

// Prisma con coordenadas de seccion [y,z], extruido sobre X.
module prisma_x(puntos, x, longitud) {
    translate([x,0,0])
        rotate([90,0,90])
            linear_extrude(height=longitud, convexity=10)
                polygon(points=puntos);
}

module contorno_exterior() {
    polygon([
        [0.8,0],[largo-0.8,0],
        [largo,0.8],[largo,ancho-0.8],
        [largo-0.8,ancho],[0.8,ancho],
        [0,ancho-0.8],[0,0.8]
    ]);
}

module envolvente() {
    union() {
        // Alivio inferior contra pie de elefante.
        hull() {
            linear_extrude(height=lamina)
                offset(delta=-0.3) contorno_exterior();
            translate([0,0,0.3])
                linear_extrude(height=lamina)
                    contorno_exterior();
        }
        translate([0,0,0.3])
            linear_extrude(height=alto-0.3)
                contorno_exterior();
    }
}

module carcasa() {
    difference() {
        envolvente();
        // Cavidad: paredes y fondo nominales de 2 mm.
        translate([pared,pared,fondo])
            cube([largo-2*pared,ancho-2*pared,alto]);
        // Boca frontal de insercion, abierta hasta las guias.
        translate([-1,-1,z_apoyo])
            cube([pared+1.01,ancho+2,alto-z_apoyo+1]);
    }
}

// La rampa inferior crece a 45 grados y sostiene la tapa.
// La cara inferior de la guia superior tambien esta a 45 grados.
perfil_superior = [
    [0.5,plano_guia+0.5],
    [saliente_guia,alto],
    [0.5,alto]
];
perfil_superior_entrada = [
    [0.5,plano_guia+1.3],
    [saliente_guia-0.8,alto],
    [0.5,alto]
];
perfil_inferior = [
    [0.5,z_apoyo-1.6-(saliente_guia-0.5)],
    [saliente_guia,z_apoyo-1.6],
    [saliente_guia,z_apoyo],
    [0.5,z_apoyo]
];
perfil_inferior_entrada = [
    [0.5,z_apoyo-1.6-(saliente_guia-0.5)],
    [saliente_guia-0.8,z_apoyo-2.4],
    [saliente_guia-0.8,z_apoyo-0.8],
    [0.5,z_apoyo-0.8]
];

module guia_con_entrada(perfil, entrada) {
    union() {
        prisma_x(perfil,1,largo-pared-1);
        hull() {
            prisma_x(entrada,0,lamina);
            prisma_x(perfil,1,lamina);
        }
    }
}

module guias_laterales() {
    for (lado=[0,1]) {
        if (lado==0) {
            guia_con_entrada(perfil_superior,perfil_superior_entrada);
            guia_con_entrada(perfil_inferior,perfil_inferior_entrada);
        } else {
            translate([0,ancho,0]) mirror([0,1,0]) {
                guia_con_entrada(perfil_superior,perfil_superior_entrada);
                guia_con_entrada(perfil_inferior,perfil_inferior_entrada);
            }
        }
    }
}

module caja() {
    union() {
        carcasa();
        guias_laterales();
    }
}

// Cola de milano: la base de la tapa es mas ancha que su cara superior.
// El desplazamiento sqrt(2)*clearance mantiene 0.4 mm NORMALES
// respecto de cada plano de guia a 45 grados.
module seccion_tapa() {
    l = borde_tapa;
    r = ancho-borde_tapa;
    e = 0.25;
    polygon([
        [l+e,z_tapa],
        [r-e,z_tapa],
        [r-e/2,z_tapa+e/2],
        [r-espesor_tapa,alto],
        [l+espesor_tapa,alto],
        [l+e/2,z_tapa+e/2]
    ]);
}

module tramo_tapa(x, longitud, retranqueo=0) {
    translate([x,0,0]) rotate([90,0,90])
        linear_extrude(height=longitud,convexity=10)
            offset(delta=-retranqueo,chamfer=true)
                seccion_tapa();
}

module tapa() {
    difference() {
        union() {
            tramo_tapa(x_inicio+longitud_entrada,
                       x_fin-x_inicio-2*longitud_entrada);
            // Chaflan perimetral en ambos extremos de deslizamiento.
            hull() {
                tramo_tapa(x_inicio,lamina,chaflan_entrada);
                tramo_tapa(x_inicio+longitud_entrada,lamina);
            }
            hull() {
                tramo_tapa(x_fin-longitud_entrada-lamina,lamina);
                tramo_tapa(x_fin-lamina,lamina,chaflan_entrada);
            }
        }
        // Uñero superior rebajado: profundidad 0.8, fondo restante 1.6.
        translate([7,ancho/2,alto+0.8])
            scale([5,8,1.6]) sphere(r=1);
    }
}

// Exactamente dos cuerpos, ambos con cara plana sobre z=0.
// Caja: 80 x 50 x 30. Separacion de impresion entre cuerpos: 10 mm.
caja();
translate([-x_inicio,60-borde_tapa,-z_tapa]) tapa();
