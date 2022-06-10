declare module 'subnet-cidr-calculator' {


    export interface IgetSubnetDetails {
        (cidr: string): IsubnetDetails
    }

    export interface IsubnetDetails {
        hosts: string[]
        noofhosts: number
        startAddr: string
        endAddr: string
    }
    
    export interface ICalculatorSubnet {
        value: string
        ipRange: {
            start: string
            end: string
        }
        range: {
            from: number
            to: number
        }
        isOverlap: boolean
    }
    
    export interface ICalculatorResults {
        pureAddressBytes: number[]
        addressDotQuad: string
        netmaskBits: number
        subnetMaskRange: {
            max: number,
            min: number
        }
        subnets: ICalculatorSubnet[]
        subnetsExcluded: string[]
    }
    
    export interface ICalculate {
        (vpcAddress: string, netmaskBits: string, existingSubnetCIDR: string[]): ICalculatorResults
    }

    export interface ISubnetCIDRAdviser {
        new (): ISubnetCIDRAdviser
        calculate: ICalculate
        getSubnetDetails: IgetSubnetDetails
    }

    export const calculate: ICalculate
    export const getSubnetDetails: IgetSubnetDetails

    export const SubnetCIDRAdviser: ISubnetCIDRAdviser
}